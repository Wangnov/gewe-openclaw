import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GeweDownloadQueue } from "./download-queue.ts";
import { handleGeweInboundBatch } from "./inbound.ts";
import { resolveGeweAllowFromPath, resolveGeweGroupClaimCodesPath } from "./pairing-store.ts";
import { setGeweRuntime } from "./runtime.ts";
import type { CoreConfig, GeweInboundMessage, ResolvedGeweAccount } from "./types.ts";

const TEST_RUNTIME = {
  log() {},
  error() {},
  exit() {},
};

function createMessage(overrides: Partial<GeweInboundMessage> = {}): GeweInboundMessage {
  return {
    messageId: overrides.messageId ?? "1",
    newMessageId: overrides.newMessageId ?? overrides.messageId ?? "1",
    appId: overrides.appId ?? "app-1",
    botWxid: overrides.botWxid ?? "wxid_bot",
    fromId: overrides.fromId ?? "room@chatroom",
    toId: overrides.toId ?? "wxid_bot",
    senderId: overrides.senderId ?? "wxid_owner",
    senderName: overrides.senderName ?? "owner",
    text: overrides.text ?? "认领码: ABCD2345",
    atWxids: overrides.atWxids ?? ["wxid_bot"],
    atAll: overrides.atAll,
    msgType: overrides.msgType ?? 1,
    xml: overrides.xml,
    timestamp: overrides.timestamp ?? Date.now(),
    isGroupChat: overrides.isGroupChat ?? true,
  };
}

function createAccount(config: ResolvedGeweAccount["config"]): ResolvedGeweAccount {
  return {
    accountId: "acct-1",
    enabled: true,
    token: "token",
    tokenSource: "config",
    appId: "app-1",
    appIdSource: "config",
    config,
  };
}

function installRuntime(params: {
  config: CoreConfig;
  writes: CoreConfig[];
  dispatches: Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>;
}) {
  let currentConfig = params.config;
  setGeweRuntime({
    config: {
      loadConfig() {
        return currentConfig;
      },
      async writeConfigFile(next: unknown) {
        currentConfig = next as CoreConfig;
        params.writes.push(currentConfig);
      },
    },
    channel: {
      activity: {
        record() {},
      },
      commands: {
        shouldHandleTextCommands: () => false,
      },
      text: {
        hasControlCommand: () => false,
        resolveMarkdownTableMode: () => "plain",
        convertMarkdownTables: (value: string) => value,
      },
      mentions: {
        buildMentionRegexes: () => [],
        matchesMentionPatterns: () => false,
      },
      routing: {
        resolveAgentRoute: () => ({
          agentId: "agent-1",
          accountId: "acct-1",
          sessionKey: "session-1",
          baseSessionKey: "session-1",
          peer: { kind: "group", id: "room@chatroom" },
          chatType: "group",
          from: "owner",
          to: "room@chatroom",
        }),
      },
      session: {
        resolveStorePath: () => "/tmp/gewe-session-store.json",
        readSessionUpdatedAt: () => undefined,
        recordInboundSession: async () => {},
      },
      reply: {
        resolveEnvelopeFormatOptions: () => ({}),
        formatAgentEnvelope: ({ body }: { body: string }) => body,
        finalizeInboundContext: (ctx: Record<string, unknown>) => ctx,
        dispatchReplyWithBufferedBlockDispatcher: async (dispatchParams: {
          ctx: Record<string, unknown>;
          replyOptions: Record<string, unknown>;
        }) => {
          params.dispatches.push({
            ctx: dispatchParams.ctx,
            replyOptions: dispatchParams.replyOptions,
          });
        },
      },
      pairing: {
        readAllowFromStore: async () => [],
        upsertPairingRequest: async () => ({ code: "123456", created: false }),
        buildPairingReply: () => "pairing",
      },
    },
  } as never);
}

async function withMockFetch<T>(
  fn: (calls: Array<{ url: string; init?: RequestInit }>) => Promise<T>,
) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      init,
    });
    return new Response(
      JSON.stringify({
        ret: 200,
        msg: "ok",
        data: { msgId: "msg-1", newMsgId: "msg-2", createTime: 1 },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function withTempStateDir<T>(fn: (stateDir: string) => Promise<T>): Promise<T> {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "gewe-group-claim-flow-"));
  const original = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  try {
    return await fn(stateDir);
  } finally {
    if (original === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = original;
    }
    await fs.rm(stateDir, { recursive: true, force: true });
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("GeWe 新群会在 owner 群内提交有效认领码时写入当前群 allowFrom", async () => {
  await withTempStateDir(async () => {
    await writeJson(resolveGeweGroupClaimCodesPath("acct-1", process.env), {
      version: 1,
      codes: [
        {
          code: "ABCD2345",
          accountId: "acct-1",
          issuerId: "wxid_owner",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const config = {
      channels: {
        "gewe-openclaw": {
          groupPolicy: "allowlist",
        },
      },
    } satisfies CoreConfig;
    const writes: CoreConfig[] = [];
    const dispatches: Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }> = [];
    installRuntime({ config, writes, dispatches });

    await withMockFetch(async (calls) => {
      await handleGeweInboundBatch({
        messages: [createMessage()],
        account: createAccount({
          groupPolicy: "allowlist",
        }),
        config,
        runtime: TEST_RUNTIME as never,
        downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
      });

      assert.equal(calls.length, 1);
      const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as { content?: string };
      assert.equal(body.content, "当前群认领成功，已授权你在本群触发机器人。请重新发送上一条消息。");
    });

    assert.equal(dispatches.length, 0);
    assert.equal(writes.length, 1);
    assert.deepEqual(
      writes[0]?.channels?.["gewe-openclaw"]?.accounts?.["acct-1"]?.groups?.["room@chatroom"],
      {
        allowFrom: ["wxid_owner"],
      },
    );
  });
});

test("GeWe 群认领码不能被其他群成员冒用", async () => {
  await withTempStateDir(async () => {
    await writeJson(resolveGeweGroupClaimCodesPath("acct-1", process.env), {
      version: 1,
      codes: [
        {
          code: "ABCD2345",
          accountId: "acct-1",
          issuerId: "wxid_owner",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const config = {
      channels: {
        "gewe-openclaw": {
          groupPolicy: "allowlist",
        },
      },
    } satisfies CoreConfig;
    const writes: CoreConfig[] = [];
    const dispatches: Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }> = [];
    installRuntime({ config, writes, dispatches });

    await withMockFetch(async (calls) => {
      await handleGeweInboundBatch({
        messages: [createMessage({ senderId: "wxid_other", senderName: "other" })],
        account: createAccount({
          groupPolicy: "allowlist",
        }),
        config,
        runtime: TEST_RUNTIME as never,
        downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
      });

      assert.equal(calls.length, 1);
      const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as { content?: string };
      assert.equal(body.content, "认领码无效、已过期，或不属于当前发送者。");
    });

    assert.equal(dispatches.length, 0);
    assert.equal(writes.length, 0);
  });
});

test("GeWe 新群认领支持真实群消息里的发送者前缀和 @机器人 格式", async () => {
  await withTempStateDir(async () => {
    await writeJson(resolveGeweGroupClaimCodesPath("acct-1", process.env), {
      version: 1,
      codes: [
        {
          code: "MASFSYCA",
          accountId: "acct-1",
          issuerId: "wxid_owner",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const config = {
      channels: {
        "gewe-openclaw": {
          groupPolicy: "allowlist",
        },
      },
    } satisfies CoreConfig;
    const writes: CoreConfig[] = [];
    const dispatches: Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }> = [];
    installRuntime({ config, writes, dispatches });

    await withMockFetch(async (calls) => {
      await handleGeweInboundBatch({
        messages: [
          createMessage({
            text: "wxid_owner:\n@琅主bot\u2005认领码: MASFSYCA",
          }),
        ],
        account: createAccount({
          groupPolicy: "allowlist",
        }),
        config,
        runtime: TEST_RUNTIME as never,
        downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
      });

      assert.equal(calls.length, 1);
      const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as { content?: string };
      assert.equal(body.content, "当前群认领成功，已授权你在本群触发机器人。请重新发送上一条消息。");
    });

    assert.equal(dispatches.length, 0);
    assert.equal(writes.length, 1);
    assert.deepEqual(
      writes[0]?.channels?.["gewe-openclaw"]?.accounts?.["acct-1"]?.groups?.["room@chatroom"],
      {
        allowFrom: ["wxid_owner"],
      },
    );
  });
});

test("GeWe 新群认领支持群里直接发送完整认领码而无需 @机器人", async () => {
  await withTempStateDir(async () => {
    await writeJson(resolveGeweGroupClaimCodesPath("acct-1", process.env), {
      version: 1,
      codes: [
        {
          code: "MASFSYCA",
          accountId: "acct-1",
          issuerId: "wxid_owner",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const config = {
      channels: {
        "gewe-openclaw": {
          groupPolicy: "allowlist",
        },
      },
    } satisfies CoreConfig;
    const writes: CoreConfig[] = [];
    const dispatches: Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }> = [];
    installRuntime({ config, writes, dispatches });

    await withMockFetch(async (calls) => {
      await handleGeweInboundBatch({
        messages: [
          createMessage({
            text: "MASFSYCA",
            atWxids: [],
          }),
        ],
        account: createAccount({
          groupPolicy: "allowlist",
        }),
        config,
        runtime: TEST_RUNTIME as never,
        downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
      });

      assert.equal(calls.length, 1);
      const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as { content?: string };
      assert.equal(body.content, "当前群认领成功，已授权你在本群触发机器人。请重新发送上一条消息。");
    });

    assert.equal(dispatches.length, 0);
    assert.equal(writes.length, 1);
    assert.deepEqual(
      writes[0]?.channels?.["gewe-openclaw"]?.accounts?.["acct-1"]?.groups?.["room@chatroom"],
      {
        allowFrom: ["wxid_owner"],
      },
    );
  });
});

test("GeWe 私聊 pairing store 不再为群消息提供隐式触发权限", async () => {
  await withTempStateDir(async () => {
    await writeJson(resolveGeweAllowFromPath("acct-1", process.env), {
      version: 1,
      allowFrom: ["wxid_pairing_user"],
    });

    const config = {
      channels: {
        "gewe-openclaw": {
          groupPolicy: "allowlist",
          groups: {
            "room@chatroom": {
              requireMention: false,
            },
          },
        },
      },
    } satisfies CoreConfig;
    const writes: CoreConfig[] = [];
    const dispatches: Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }> = [];
    installRuntime({ config, writes, dispatches });

    await handleGeweInboundBatch({
      messages: [
        createMessage({
          senderId: "wxid_pairing_user",
          senderName: "paired-user",
          text: "hello from paired user",
          atWxids: [],
        }),
      ],
      account: createAccount({
        groupPolicy: "allowlist",
        groups: {
          "room@chatroom": {
            requireMention: false,
          },
        },
      }),
      config,
      runtime: TEST_RUNTIME as never,
      downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
    });

    assert.equal(writes.length, 0);
    assert.equal(dispatches.length, 0);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { GeweDownloadQueue } from "./download-queue.ts";
import { gewePlugin } from "./channel.ts";
import { handleGeweInboundBatch } from "./inbound.ts";
import {
  resolveGeweAllowFromPath,
  resolveGeweLegacyPairingPath,
} from "./pairing-store.ts";
import { setGeweRuntime } from "./runtime.ts";
import type { GeweInboundMessage, ResolvedGeweAccount } from "./types.ts";

function createMessage(overrides: Partial<GeweInboundMessage> = {}): GeweInboundMessage {
  return {
    messageId: overrides.messageId ?? "1",
    newMessageId: overrides.newMessageId ?? "1",
    appId: overrides.appId ?? "app-1",
    botWxid: overrides.botWxid ?? "wxid_bot",
    fromId: overrides.fromId ?? "wxid_sender",
    toId: overrides.toId ?? "wxid_bot",
    senderId: overrides.senderId ?? "wxid_sender",
    senderName: overrides.senderName ?? "sender",
    text: overrides.text ?? "hello",
    msgType: overrides.msgType ?? 1,
    xml: overrides.xml,
    timestamp: overrides.timestamp ?? Date.now(),
    isGroupChat: overrides.isGroupChat ?? false,
  };
}

function createAccount(overrides: Partial<ResolvedGeweAccount> = {}): ResolvedGeweAccount {
  return {
    accountId: overrides.accountId ?? "acct-2",
    enabled: overrides.enabled ?? true,
    name: overrides.name,
    token: overrides.token ?? "token-1",
    tokenSource: overrides.tokenSource ?? "config",
    appId: overrides.appId ?? "app-1",
    appIdSource: overrides.appIdSource ?? "config",
    config: {
      dmPolicy: "pairing",
      ...(overrides.config ?? {}),
    },
  };
}

function installRuntime(capture: {
  dispatches: Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>;
}) {
  let readAllowFromStoreCalls = 0;
  setGeweRuntime({
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
      pairing: {
        readAllowFromStore: async () => {
          readAllowFromStoreCalls += 1;
          throw new TypeError("(0 , _pluginSdk.normalizeAccountId) is not a function");
        },
      },
      routing: {
        resolveAgentRoute: () => ({
          agentId: "agent-1",
          accountId: "acct-pairing",
          sessionKey: "session-1",
          baseSessionKey: "session-1",
          peer: { kind: "direct", id: "wxid_scope_user" },
          chatType: "direct",
          from: "sender",
          to: "wxid_scope_user",
        }),
      },
      session: {
        resolveStorePath: () => "/tmp/gewe-pairing-session-store.json",
        readSessionUpdatedAt: () => undefined,
        recordInboundSession: async () => {},
      },
      reply: {
        resolveEnvelopeFormatOptions: () => ({}),
        formatAgentEnvelope: ({ body }: { body: string }) => body,
        finalizeInboundContext: (ctx: Record<string, unknown>) => ctx,
        dispatchReplyWithBufferedBlockDispatcher: async (params: {
          ctx: Record<string, unknown>;
          replyOptions: Record<string, unknown>;
        }) => {
          capture.dispatches.push({
            ctx: params.ctx,
            replyOptions: params.replyOptions,
          });
        },
      },
    },
  } as never);
  return {
    getReadAllowFromStoreCalls: () => readAllowFromStoreCalls,
  };
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
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "gewe-pairing-flow-test-"));
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  try {
    return await fn(stateDir);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    await fs.rm(stateDir, { recursive: true, force: true });
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("GeWe pairing adapter 使用 code 模式", () => {
  assert.equal((gewePlugin.pairing as { mode?: string }).mode, "code");
});

test("GeWe channel plugin 在当前 OpenClaw plugin-sdk 下可构造 configSchema", () => {
  assert.ok(gewePlugin.configSchema?.schema);
});

test("GeWe 入站会优先读取本地 allowFrom store，即使宿主 pairing helper 崩溃", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  const runtime = installRuntime(capture);

  await withTempStateDir(async () => {
    await writeJson(resolveGeweAllowFromPath("acct-allow"), {
      version: 1,
      allowFrom: ["wxid_link_sender"],
    });

    await handleGeweInboundBatch({
      messages: [
        createMessage({
          senderId: "wxid_link_sender",
          fromId: "wxid_link_sender",
          text: "hello from allowlist",
        }),
      ],
      account: createAccount({ accountId: "acct-allow" }),
      config: {},
      runtime: {
        log() {},
        error() {},
      } as never,
      downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
    });
  });

  assert.equal(runtime.getReadAllowFromStoreCalls(), 0);
  assert.equal(capture.dispatches.length, 1);
  assert.equal(capture.dispatches[0]?.ctx.RawBody, "hello from allowlist");
});

test("GeWe 提交纯配对码时会兼容 legacy pairing store 并回复成功", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  const runtime = installRuntime(capture);

  await withTempStateDir(async () => {
    const now = new Date().toISOString();
    await writeJson(resolveGeweLegacyPairingPath(), {
      version: 1,
      requests: [
        {
          id: "gh_c3819e351514",
          code: "ZXCV5678",
          createdAt: now,
          lastSeenAt: now,
          meta: {
            accountId: "acct-pairing",
          },
        },
      ],
    });

    await withMockFetch(async (calls) => {
      await handleGeweInboundBatch({
        messages: [
          createMessage({
            senderId: "wxid_scope_user",
            fromId: "wxid_scope_user",
            text: "zxcv5678",
          }),
        ],
        account: createAccount({ accountId: "acct-pairing" }),
        config: {},
        runtime: {
          log() {},
          error() {},
        } as never,
        downloadQueue: {} as never,
      });

      assert.equal(calls.length, 1);
      const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as { content?: string };
      assert.equal(body.content, "配对成功，已加入允许列表。请重新发送上一条消息。");
    });

    const allowFrom = JSON.parse(
      await fs.readFile(resolveGeweAllowFromPath("acct-pairing"), "utf8"),
    ) as { allowFrom?: string[] };
    assert.deepEqual(allowFrom.allowFrom, ["wxid_scope_user"]);
  });

  assert.equal(runtime.getReadAllowFromStoreCalls(), 0);
});

test("GeWe 提交无效配对码时回复失败提示", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  const runtime = installRuntime(capture);

  await withTempStateDir(async () => {
    await withMockFetch(async (calls) => {
      await handleGeweInboundBatch({
        messages: [
          createMessage({
            senderId: "wxid_scope_user",
            fromId: "wxid_scope_user",
            text: "配对码: ZXCV5678",
          }),
        ],
        account: createAccount({ accountId: "acct-pairing" }),
        config: {},
        runtime: {
          log() {},
          error() {},
        } as never,
        downloadQueue: {} as never,
      });

      assert.equal(calls.length, 1);
      const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as { content?: string };
      assert.equal(body.content, "配对码无效或已过期。");
    });
  });

  assert.equal(runtime.getReadAllowFromStoreCalls(), 0);
});

test("GeWe 陌生私聊普通文本会静默丢弃", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  const runtime = installRuntime(capture);

  await withTempStateDir(async () => {
    await withMockFetch(async (calls) => {
      await handleGeweInboundBatch({
        messages: [createMessage({ text: "hello there" })],
        account: createAccount({ accountId: "acct-pairing" }),
        config: {},
        runtime: {
          log() {},
          error() {},
        } as never,
        downloadQueue: {} as never,
      });

      assert.equal(calls.length, 0);
    });
  });

  assert.equal(runtime.getReadAllowFromStoreCalls(), 0);
  assert.equal(capture.dispatches.length, 0);
});

import test from "node:test";
import assert from "node:assert/strict";

import { gewePlugin } from "./channel.ts";
import { handleGeweInboundBatch } from "./inbound.ts";
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

function createAccount(
  overrides: Partial<ResolvedGeweAccount> = {},
): ResolvedGeweAccount {
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

function installRuntime(params: {
  readAllowFromStore?: (input: unknown) => Promise<string[]>;
  redeemPairCode?: (input: unknown) => Promise<{ id: string; code: string } | null>;
}) {
  setGeweRuntime({
    channel: {
      activity: {
        record() {},
      },
      pairing: {
        readAllowFromStore: params.readAllowFromStore ?? (async () => []),
        redeemPairCode: params.redeemPairCode ?? (async () => null),
      },
      commands: {
        shouldHandleTextCommands: () => false,
      },
      text: {
        hasControlCommand: () => false,
        resolveMarkdownTableMode: () => "plain",
        convertMarkdownTables: (value: string) => value,
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

test("GeWe 读取 pairing allowFrom 时带上 accountId", async () => {
  let seen: unknown;
  installRuntime({
    readAllowFromStore: async (input) => {
      seen = input;
      return [];
    },
  });

  await handleGeweInboundBatch({
    messages: [createMessage()],
    account: createAccount({
      accountId: "acct-allow",
      config: { dmPolicy: "disabled" },
    }),
    config: {},
    runtime: {
      log() {},
      error() {},
    } as never,
    downloadQueue: {} as never,
  });

  assert.deepEqual(seen, {
    channel: "gewe-openclaw",
    accountId: "acct-allow",
  });
});

test("GeWe pairing adapter 使用 code 模式", () => {
  assert.equal((gewePlugin.pairing as { mode?: string }).mode, "code");
});

test("GeWe 提交纯配对码时按 accountId 作用域 redeem 并回复成功", async () => {
  let seen: unknown;
  installRuntime({
    readAllowFromStore: async () => [],
    redeemPairCode: async (input) => {
      seen = input;
      return { code: "ZXCV5678", id: "wxid_scope_user" };
    },
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

    assert.deepEqual(seen, {
      channel: "gewe-openclaw",
      accountId: "acct-pairing",
      code: "ZXCV5678",
      id: "wxid_scope_user",
    });
    assert.equal(calls.length, 1);
    const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as { content?: string };
    assert.equal(body.content, "配对成功，已加入允许列表。请重新发送上一条消息。");
  });
});

test("GeWe 提交无效配对码时回复失败提示", async () => {
  let seen: unknown;
  installRuntime({
    readAllowFromStore: async () => [],
    redeemPairCode: async (input) => {
      seen = input;
      return null;
    },
  });

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

    assert.deepEqual(seen, {
      channel: "gewe-openclaw",
      accountId: "acct-pairing",
      code: "ZXCV5678",
      id: "wxid_scope_user",
    });
    assert.equal(calls.length, 1);
    const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as { content?: string };
    assert.equal(body.content, "配对码无效或已过期。");
  });
});

test("GeWe 陌生私聊普通文本会静默丢弃且不尝试 redeem", async () => {
  let redeemCalls = 0;
  installRuntime({
    readAllowFromStore: async () => [],
    redeemPairCode: async () => {
      redeemCalls += 1;
      return null;
    },
  });

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

    assert.equal(redeemCalls, 0);
    assert.equal(calls.length, 0);
  });
});

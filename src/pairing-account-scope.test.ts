import test from "node:test";
import assert from "node:assert/strict";

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
  upsertPairingRequest?: (input: unknown) => Promise<{ code: string; created: boolean }>;
}) {
  setGeweRuntime({
    channel: {
      pairing: {
        readAllowFromStore: params.readAllowFromStore ?? (async () => []),
        upsertPairingRequest:
          params.upsertPairingRequest ??
          (async () => ({
            code: "ABCD1234",
            created: false,
          })),
        buildPairingReply: () => "pairing reply",
      },
      commands: {
        shouldHandleTextCommands: () => false,
      },
      text: {
        hasControlCommand: () => false,
      },
    },
  } as never);
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

test("GeWe 创建 pairing 请求时按 accountId 作用域写入", async () => {
  let seen: unknown;
  installRuntime({
    readAllowFromStore: async () => [],
    upsertPairingRequest: async (input) => {
      seen = input;
      return { code: "ZXCV5678", created: false };
    },
  });

  await handleGeweInboundBatch({
    messages: [createMessage({ senderId: "wxid_scope_user", fromId: "wxid_scope_user" })],
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
    id: "wxid_scope_user",
    meta: { name: "sender" },
  });
});

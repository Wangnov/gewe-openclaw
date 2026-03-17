import assert from "node:assert/strict";
import test from "node:test";

import { GeweDownloadQueue } from "./download-queue.ts";
import { handleGeweInboundBatch } from "./inbound.ts";
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
    senderId: overrides.senderId ?? "wxid_sender",
    senderName: overrides.senderName ?? "sender",
    text: overrides.text ?? "hello",
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

function installRuntime(capture: {
  dispatches: Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>;
}) {
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
          from: "sender",
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
      pairing: {
        readAllowFromStore: async () => [],
        upsertPairingRequest: async () => ({ code: "123456", created: false }),
        buildPairingReply: () => "pairing",
      },
    },
  } as never);
}

test("GeWe wildcard 组配置会向 replyOptions 透传 skills 并回退 systemPrompt", async () => {
  const capture = { dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }> };
  installRuntime(capture);

  await handleGeweInboundBatch({
    messages: [createMessage()],
    account: createAccount({
      groupPolicy: "open",
      groups: {
        "room@chatroom": {
          requireMention: false,
        },
        "*": {
          skills: ["alpha-skill"],
          systemPrompt: "  Use alpha  ",
        },
      },
    }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 1);
  assert.deepEqual(capture.dispatches[0]?.replyOptions.skillFilter, ["alpha-skill"]);
  assert.equal(capture.dispatches[0]?.ctx.GroupSystemPrompt, "Use alpha");
});

test("GeWe wildcard 组配置的 enabled=false 会阻止群消息分发", async () => {
  const capture = { dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }> };
  installRuntime(capture);

  await handleGeweInboundBatch({
    messages: [createMessage()],
    account: createAccount({
      groupPolicy: "open",
      groups: {
        "room@chatroom": {
          requireMention: false,
        },
        "*": {
          enabled: false,
        },
      },
    }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 0);
});

test("GeWe wildcard 组配置的 allowFrom 会参与群发送者校验", async () => {
  const capture = { dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }> };
  installRuntime(capture);

  await handleGeweInboundBatch({
    messages: [createMessage({ senderId: "wxid_allowed" })],
    account: createAccount({
      groupPolicy: "allowlist",
      groups: {
        "room@chatroom": {
          requireMention: false,
        },
        "*": {
          allowFrom: ["wxid_allowed"],
        },
      },
    }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 1);
});

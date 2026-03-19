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
    atWxids: overrides.atWxids,
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

test("GeWe 群 trigger.mode=quote 仅在引用机器人消息时触发", async () => {
  const capture = { dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }> };
  installRuntime(capture);
  const xml = [
    "<?xml version=\"1.0\"?>",
    "<msg>",
    "<appmsg appid=\"\" sdkver=\"0\">",
    "<title>回复内容</title>",
    "<type>57</type>",
    "<refermsg>",
    "<type>1</type>",
    "<svrid>3617029648443513152</svrid>",
    "<fromusr>wxid_bot</fromusr>",
    "<chatusr>room@chatroom</chatusr>",
    "<displayname>GeWe Bot</displayname>",
    "<content>原始文本</content>",
    "</refermsg>",
    "</appmsg>",
    "</msg>",
  ].join("");

  await handleGeweInboundBatch({
    messages: [createMessage({ msgType: 49, xml })],
    account: createAccount({
      groupPolicy: "open",
      groups: {
        "room@chatroom": {
          trigger: { mode: "quote" },
        },
      },
    }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 1);
});

test("GeWe 群 trigger.mode=quote 不会因引用其他成员消息而触发", async () => {
  const capture = { dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }> };
  installRuntime(capture);
  const xml = [
    "<?xml version=\"1.0\"?>",
    "<msg>",
    "<appmsg appid=\"\" sdkver=\"0\">",
    "<title>回复内容</title>",
    "<type>57</type>",
    "<refermsg>",
    "<type>1</type>",
    "<svrid>3617029648443513152</svrid>",
    "<fromusr>wxid_other</fromusr>",
    "<chatusr>room@chatroom</chatusr>",
    "<displayname>Other</displayname>",
    "<content>原始文本</content>",
    "</refermsg>",
    "</appmsg>",
    "</msg>",
  ].join("");

  await handleGeweInboundBatch({
    messages: [createMessage({ msgType: 49, xml })],
    account: createAccount({
      groupPolicy: "open",
      groups: {
        "room@chatroom": {
          trigger: { mode: "quote" },
        },
      },
    }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 0);
});

test("GeWe 群 at 触发会把 route.agentId 传给 mention regex 构造器", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };

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
        buildMentionRegexes: (_cfg: unknown, agentId?: string) =>
          agentId === "agent-1" ? [/@小助手/i] : [],
        matchesMentionPatterns: (text: string, patterns: RegExp[]) =>
          patterns.some((pattern) => pattern.test(text)),
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

  await handleGeweInboundBatch({
    messages: [createMessage({ text: "@小助手 你好" })],
    account: createAccount({
      groupPolicy: "open",
    }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 1);
});

test("GeWe 群 trigger.mode=at 在原生 atuserlist 命中机器人时会触发", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  installRuntime(capture);

  await handleGeweInboundBatch({
    messages: [
      createMessage({
        text: "@琅主bot hi",
        atWxids: ["wxid_bot"],
      }),
    ],
    account: createAccount({
      groupPolicy: "open",
      groups: {
        "room@chatroom": {
          trigger: { mode: "at" },
        },
      },
    }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 1);
});

test("GeWe 群 trigger.mode=at 不会因 notify@all 单独出现而触发", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  installRuntime(capture);

  await handleGeweInboundBatch({
    messages: [
      createMessage({
        text: "@所有人 hi",
        atWxids: ["notify@all"],
        atAll: true,
      }),
    ],
    account: createAccount({
      groupPolicy: "open",
      groups: {
        "room@chatroom": {
          trigger: { mode: "at" },
        },
      },
    }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 0);
});

test("GeWe 群 trigger.mode=at 在同时 @全体 和 @机器人时仍会触发", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  installRuntime(capture);

  await handleGeweInboundBatch({
    messages: [
      createMessage({
        text: "@所有人 @琅主bot hi",
        atWxids: ["notify@all", "wxid_bot"],
        atAll: true,
      }),
    ],
    account: createAccount({
      groupPolicy: "open",
      groups: {
        "room@chatroom": {
          trigger: { mode: "at" },
        },
      },
    }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 1);
});

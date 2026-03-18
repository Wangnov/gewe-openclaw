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
    fromId: overrides.fromId ?? "wxid_sender",
    toId: overrides.toId ?? "wxid_bot",
    senderId: overrides.senderId ?? "wxid_sender",
    senderName: overrides.senderName ?? "sender",
    text: overrides.text ?? "hello",
    msgType: overrides.msgType ?? 49,
    xml: overrides.xml,
    timestamp: overrides.timestamp ?? Date.now(),
    isGroupChat: overrides.isGroupChat ?? false,
  };
}

function createAccount(config: ResolvedGeweAccount["config"]): ResolvedGeweAccount {
  return {
    accountId: "acct-inbound",
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
          accountId: "acct-inbound",
          sessionKey: "session-1",
          baseSessionKey: "session-1",
          peer: { kind: "direct", id: "wxid_sender" },
          chatType: "direct",
          from: "sender",
          to: "wxid_sender",
        }),
      },
      session: {
        resolveStorePath: () => "/tmp/gewe-inbound-session-store.json",
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
      },
    },
  } as never);
}

test("GeWe 未知 appmsg 类型会继续分发并保留 xml 元数据", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  installRuntime(capture);
  const xml =
    "<msg><appmsg><title>霸王茶姬</title><type>33</type></appmsg></msg>";

  await handleGeweInboundBatch({
    messages: [createMessage({ xml })],
    account: createAccount({ dmPolicy: "open" }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 1);
  assert.equal(capture.dispatches[0]?.ctx.RawBody, "<appmsg:33>");
  assert.equal(capture.dispatches[0]?.ctx.GeWeXml, xml);
  assert.equal(capture.dispatches[0]?.ctx.GeWeAppMsgXml, xml);
  assert.equal(capture.dispatches[0]?.ctx.GeWeAppMsgType, 33);
  assert.equal(capture.dispatches[0]?.ctx.MsgType, 49);
});

test("GeWe 链接 appmsg 会继续保留链接正文并附带 xml 元数据", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  installRuntime(capture);
  const xml =
    "<msg><appmsg><title>标题</title><des>描述</des><type>5</type><url>https://example.com/post</url></appmsg></msg>";

  await handleGeweInboundBatch({
    messages: [createMessage({ xml })],
    account: createAccount({ dmPolicy: "open" }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 1);
  assert.equal(capture.dispatches[0]?.ctx.RawBody, "[Link] 标题\n描述\nhttps://example.com/post");
  assert.equal(capture.dispatches[0]?.ctx.GeWeXml, xml);
  assert.equal(capture.dispatches[0]?.ctx.GeWeAppMsgXml, xml);
  assert.equal(capture.dispatches[0]?.ctx.GeWeAppMsgType, 5);
  assert.equal(capture.dispatches[0]?.ctx.MsgType, 49);
});

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

test("GeWe 引用消息会归一成可读正文并透传上下文字段", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
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
    "<fromusr>wxid_phyyedw9xap22</fromusr>",
    "<chatusr>wxid_phyyedw9xap22</chatusr>",
    "<displayname>朝夕。</displayname>",
    "<content>原始文本</content>",
    "</refermsg>",
    "</appmsg>",
    "</msg>",
  ].join("");

  await handleGeweInboundBatch({
    messages: [createMessage({ xml })],
    account: createAccount({ dmPolicy: "open" }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 1);
  assert.equal(capture.dispatches[0]?.ctx.RawBody, "[引用:文本] 原始文本\n回复内容");
  assert.equal(capture.dispatches[0]?.ctx.GeWeXml, xml);
  assert.equal(capture.dispatches[0]?.ctx.GeWeAppMsgXml, xml);
  assert.equal(capture.dispatches[0]?.ctx.GeWeAppMsgType, 57);
  assert.equal(capture.dispatches[0]?.ctx.GeWeQuoteTitle, "回复内容");
  assert.equal(capture.dispatches[0]?.ctx.GeWeQuoteType, 1);
  assert.equal(capture.dispatches[0]?.ctx.GeWeQuoteSvrid, "3617029648443513152");
  assert.equal(capture.dispatches[0]?.ctx.GeWeQuoteFromUsr, "wxid_phyyedw9xap22");
  assert.equal(capture.dispatches[0]?.ctx.GeWeQuoteChatUsr, "wxid_phyyedw9xap22");
  assert.equal(capture.dispatches[0]?.ctx.GeWeQuoteDisplayName, "朝夕。");
  assert.equal(capture.dispatches[0]?.ctx.GeWeQuoteContent, "原始文本");
  assert.equal(capture.dispatches[0]?.ctx.MsgType, 49);
});

test("GeWe 非文本引用不会把整段 xml 泄露进正文", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  installRuntime(capture);
  const xml = [
    "<?xml version=\"1.0\"?>",
    "<msg>",
    "<appmsg appid=\"\" sdkver=\"0\">",
    "<title>看看这个</title>",
    "<type>57</type>",
    "<refermsg>",
    "<type>6</type>",
    "<svrid>3617029648443513152</svrid>",
    "<content>&lt;msg&gt;&lt;appmsg&gt;&lt;title&gt;hhh.xlsx&lt;/title&gt;&lt;type&gt;6&lt;/type&gt;&lt;/appmsg&gt;&lt;/msg&gt;</content>",
    "</refermsg>",
    "</appmsg>",
    "</msg>",
  ].join("");

  await handleGeweInboundBatch({
    messages: [createMessage({ xml })],
    account: createAccount({ dmPolicy: "open" }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 1);
  assert.equal(capture.dispatches[0]?.ctx.RawBody, "[引用:文件]\n看看这个");
  assert.doesNotMatch(String(capture.dispatches[0]?.ctx.RawBody ?? ""), /<msg>|<appmsg>/);
  assert.equal(
    capture.dispatches[0]?.ctx.GeWeQuoteContent,
    "<msg><appmsg><title>hhh.xlsx</title><type>6</type></appmsg></msg>",
  );
});

test("GeWe 部分引用会透传片段元数据并优先展示片段正文", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  installRuntime(capture);
  const xml = [
    "<?xml version=\"1.0\"?>",
    "<msg>",
    "<appmsg appid=\"\" sdkver=\"0\">",
    "<title>本消息为引用消息</title>",
    "<type>57</type>",
    "<refermsg>",
    "<partialtext>",
    "<start><![CDATA[你]]></start>",
    "<end><![CDATA[啊]]></end>",
    "<startindex>0</startindex>",
    "<endindex>0</endindex>",
    "<quotemd5>124756ef340daf80196b4124686d651c</quotemd5>",
    "</partialtext>",
    "<type>1</type>",
    "<svrid>3464478223924169609</svrid>",
    "<fromusr>wxid_mly499mvz23o21</fromusr>",
    "<chatusr>wxid_mly499mvz23o21</chatusr>",
    "<displayname>CLAsh</displayname>",
    "<content>我这是一句完整的话，但我只需要引用你好啊三个字</content>",
    "</refermsg>",
    "</appmsg>",
    "</msg>",
  ].join("");

  await handleGeweInboundBatch({
    messages: [createMessage({ xml })],
    account: createAccount({ dmPolicy: "open" }),
    config: {} as CoreConfig,
    runtime: TEST_RUNTIME,
    downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
  });

  assert.equal(capture.dispatches.length, 1);
  assert.equal(capture.dispatches[0]?.ctx.RawBody, "[引用:文本] 你好啊\n本消息为引用消息");
  assert.equal(capture.dispatches[0]?.ctx.GeWeQuotePartialStart, "你");
  assert.equal(capture.dispatches[0]?.ctx.GeWeQuotePartialEnd, "啊");
  assert.equal(capture.dispatches[0]?.ctx.GeWeQuotePartialStartIndex, 0);
  assert.equal(capture.dispatches[0]?.ctx.GeWeQuotePartialEndIndex, 0);
  assert.equal(
    capture.dispatches[0]?.ctx.GeWeQuotePartialQuoteMd5,
    "124756ef340daf80196b4124686d651c",
  );
  assert.equal(capture.dispatches[0]?.ctx.GeWeQuotePartialText, "你好啊");
});

test("GeWe DM wildcard 规则会向 replyOptions 透传 skills 并附带 systemPrompt", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  installRuntime(capture);

  await handleGeweInboundBatch({
    messages: [createMessage({ msgType: 1, text: "hello" })],
    account: createAccount({
      dmPolicy: "open",
      dms: {
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

test("GeWe DM trigger.mode=quote 会阻止普通文本消息分发", async () => {
  const capture = {
    dispatches: [] as Array<{ ctx: Record<string, unknown>; replyOptions: Record<string, unknown> }>,
  };
  installRuntime(capture);

  await handleGeweInboundBatch({
    messages: [createMessage({ msgType: 1, text: "hello" })],
    account: createAccount({
      dmPolicy: "open",
      dms: {
        "*": {
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

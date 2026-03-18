import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GeweDownloadQueue } from "./download-queue.ts";
import { deliverGewePayload } from "./delivery.ts";
import { handleGeweInboundBatch } from "./inbound.ts";
import { setGeweRuntime } from "./runtime.ts";
import type { CoreConfig, GeweInboundMessage, ResolvedGeweAccount } from "./types.ts";

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

function createAccount(config: ResolvedGeweAccount["config"] = {}): ResolvedGeweAccount {
  return {
    accountId: "acct-quote-bridge",
    enabled: true,
    token: "token",
    tokenSource: "config",
    appId: "app-1",
    appIdSource: "config",
    config,
  };
}

function installRuntime(): void {
  setGeweRuntime({
    media: {
      detectMime: async () => "application/octet-stream",
      mediaKindFromMime: () => "file",
    },
    logging: {
      getChildLogger: () => ({
        info() {},
        warn() {},
        error() {},
      }),
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
          accountId: "acct-quote-bridge",
          sessionKey: "session-1",
          baseSessionKey: "session-1",
          peer: { kind: "direct", id: "wxid_sender" },
          chatType: "direct",
          from: "sender",
          to: "wxid_sender",
        }),
      },
      session: {
        resolveStorePath: () => "/tmp/gewe-quote-bridge-session-store.json",
        readSessionUpdatedAt: () => undefined,
        recordInboundSession: async () => {},
      },
      reply: {
        resolveEnvelopeFormatOptions: () => ({}),
        formatAgentEnvelope: ({ body }: { body: string }) => body,
        finalizeInboundContext: (ctx: Record<string, unknown>) => ctx,
        dispatchReplyWithBufferedBlockDispatcher: async () => {},
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

async function withTempStateDir<T>(fn: () => Promise<T>): Promise<T> {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "gewe-quote-bridge-test-"));
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  try {
    return await fn();
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    await fs.rm(stateDir, { recursive: true, force: true });
  }
}

test("replyToId 会自动复用 GeWe 部分引用上下文", { concurrency: false }, async () => {
  installRuntime();
  const xml = [
    "<?xml version=\"1.0\"?>",
    "<msg>",
    "<appmsg appid=\"\" sdkver=\"0\">",
    "<title>部分引用回复</title>",
    "<type>57</type>",
    "<refermsg>",
    "<type>1</type>",
    "<svrid>3617029648443513152</svrid>",
    "<fromusr>wxid_sender</fromusr>",
    "<chatusr>wxid_sender</chatusr>",
    "<displayname>sender</displayname>",
    "<content>你好啊世界</content>",
    "<partialtext>",
    "<start>你</start>",
    "<end>啊</end>",
    "<startindex>0</startindex>",
    "<endindex>0</endindex>",
    "<quotemd5>124756ef340daf80196b4124686d651c</quotemd5>",
    "</partialtext>",
    "</refermsg>",
    "</appmsg>",
    "</msg>",
  ].join("");

  await withTempStateDir(async () => {
    await handleGeweInboundBatch({
      messages: [
        createMessage({
          newMessageId: "incoming-quote-msg",
          xml,
        }),
      ],
      account: createAccount({ dmPolicy: "open" }),
      config: {} as CoreConfig,
      runtime: {
        log() {},
        error() {},
      } as never,
      downloadQueue: new GeweDownloadQueue({ minDelayMs: 0, maxDelayMs: 0 }),
    });

    await withMockFetch(async (calls) => {
      await deliverGewePayload({
        payload: {
          text: "这是自动部分引用回复",
          replyToId: "incoming-quote-msg",
        },
        account: createAccount(),
        cfg: {} as CoreConfig,
        toWxid: "wxid_sender",
      });

      assert.equal(calls.length, 1);
      const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as {
        appmsg?: string;
      };
      assert.match(body.appmsg ?? "", /<type>57<\/type>/);
      assert.match(body.appmsg ?? "", /<svrid>3617029648443513152<\/svrid>/);
      assert.doesNotMatch(body.appmsg ?? "", /<svrid>incoming-quote-msg<\/svrid>/);
      assert.match(body.appmsg ?? "", /<partialtext>/);
      assert.match(body.appmsg ?? "", /<start>你<\/start>/);
      assert.match(body.appmsg ?? "", /<end>啊<\/end>/);
      assert.match(body.appmsg ?? "", /<quotemd5>124756ef340daf80196b4124686d651c<\/quotemd5>/);
    });
  });
});

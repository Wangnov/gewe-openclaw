import assert from "node:assert/strict";
import test from "node:test";

import { gewePlugin } from "./channel.ts";
import { setGeweRuntime } from "./runtime.js";

function createRuntimeStub() {
  return {
    logging: {
      getChildLogger() {
        return {
          info() {},
          warn() {},
          error() {},
          debug() {},
        };
      },
      shouldLogVerbose() {
        return false;
      },
    },
    channel: {
      activity: {
        record() {},
      },
      media: {
        async fetchRemoteMedia() {
          throw new Error("unexpected fetchRemoteMedia");
        },
        async saveMediaBuffer() {
          throw new Error("unexpected saveMediaBuffer");
        },
      },
    },
    media: {
      async detectMime() {
        return undefined;
      },
    },
  };
}

function createConfiguredConfig() {
  return {
    channels: {
      "gewe-openclaw": {
        token: "token",
        appId: "app-id",
      },
    },
  };
}

async function withMockFetch<T>(
  responder: (url: string, init?: RequestInit) => Promise<Response>,
  fn: (calls: Array<{ url: string; init?: RequestInit }>) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return await responder(url, init);
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("GeWe actions 会暴露 send/reply/unsend 和 gewe 扩展 schema", () => {
  const discovery = gewePlugin.actions?.describeMessageTool({
    cfg: createConfiguredConfig() as never,
    currentChannelProvider: "gewe-openclaw",
  });

  assert.deepEqual(discovery?.actions, ["send", "reply", "unsend"]);
  const schemaList = Array.isArray(discovery?.schema)
    ? discovery?.schema
    : discovery?.schema
      ? [discovery.schema]
      : [];
  assert.ok(schemaList.length > 0);
  const allProps = Object.assign({}, ...schemaList.map((entry) => entry.properties));
  assert.ok("gewe" in allProps);
  assert.ok("messageId" in allProps);
  assert.ok("newMessageId" in allProps);
  assert.ok("createTime" in allProps);
});

test("GeWe actions send 会把 replyTo 和 gewe.quote.partialText 桥接成引用回复", async () => {
  setGeweRuntime(createRuntimeStub() as never);
  const cfg = createConfiguredConfig();

  await withMockFetch(
    async (url) => {
      if (url.endsWith("/gewe/v2/api/message/postAppMsg")) {
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: {
              msgId: "1001",
              newMsgId: "2002",
              createTime: 1710000000,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    },
    async (calls) => {
      const result = await gewePlugin.actions?.handleAction?.({
        action: "send",
        cfg: cfg as never,
        params: {
          to: "room@chatroom",
          message: "跟进一下",
          replyTo: "208008054840614808",
          gewe: {
            quote: {
              partialText: "旧消息片段",
            },
          },
        },
      } as never);

      assert.equal((result as Record<string, unknown>).details?.ok, true);
      assert.equal(calls.length, 1);
      const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as Record<string, unknown>;
      assert.equal(body.toWxid, "room@chatroom");
      const appmsg = String(body.appmsg ?? "");
      assert.match(appmsg, /<type>57<\/type>/);
      assert.match(appmsg, /<svrid>208008054840614808<\/svrid>/);
      assert.match(appmsg, /<partialtext>/);
    },
  );
});

test("GeWe actions reply 会从当前会话和当前消息推断目标并发送引用回复", async () => {
  setGeweRuntime(createRuntimeStub() as never);
  const cfg = createConfiguredConfig();

  await withMockFetch(
    async (url) => {
      if (url.endsWith("/gewe/v2/api/message/postAppMsg")) {
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: {
              msgId: "3003",
              newMsgId: "4004",
              createTime: 1710000001,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    },
    async (calls) => {
      const result = await gewePlugin.actions?.handleAction?.({
        action: "reply",
        cfg: cfg as never,
        params: {
          message: "收到",
        },
        toolContext: {
          currentChannelId: "room@chatroom",
          currentMessageId: "508080808080",
        },
      } as never);

      assert.equal((result as Record<string, unknown>).details?.ok, true);
      const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as Record<string, unknown>;
      assert.equal(body.toWxid, "room@chatroom");
      assert.match(String(body.appmsg ?? ""), /<svrid>508080808080<\/svrid>/);
    },
  );
});

test("GeWe actions unsend 会从当前会话推断 to 并调用 revokeMsg", async () => {
  setGeweRuntime(createRuntimeStub() as never);
  const cfg = createConfiguredConfig();

  await withMockFetch(
    async (url) => {
      if (url.endsWith("/gewe/v2/api/message/revokeMsg")) {
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: {},
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    },
    async (calls) => {
      const result = await gewePlugin.actions?.handleAction?.({
        action: "unsend",
        cfg: cfg as never,
        params: {
          messageId: "10001",
          newMessageId: "10002",
          createTime: "1710000002",
        },
        toolContext: {
          currentChannelId: "room@chatroom",
        },
      } as never);

      assert.equal((result as Record<string, unknown>).details?.ok, true);
      const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as Record<string, unknown>;
      assert.equal(body.toWxid, "room@chatroom");
      assert.equal(body.msgId, "10001");
      assert.equal(body.newMsgId, "10002");
      assert.equal(body.createTime, "1710000002");
    },
  );
});

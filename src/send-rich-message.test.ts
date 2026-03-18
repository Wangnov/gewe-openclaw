import assert from "node:assert/strict";
import test from "node:test";

import { setGeweRuntime } from "./runtime.ts";
import type { ResolvedGeweAccount } from "./types.ts";

function createAccount(config: ResolvedGeweAccount["config"] = {}): ResolvedGeweAccount {
  return {
    accountId: "acct-rich",
    enabled: true,
    token: "token-rich",
    tokenSource: "config",
    appId: "app-rich",
    appIdSource: "config",
    config,
  };
}

function installRuntime() {
  setGeweRuntime({
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
      text: {
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
        data: { msgId: "msg-rich-1", newMsgId: "msg-rich-2", createTime: 1 },
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

test("sendAppMsgGewe 会向 GeWe postAppMsg 发送 appmsg", async () => {
  installRuntime();
  const sendModule = (await import("./send.ts")) as {
    sendAppMsgGewe?: (params: {
      account: ResolvedGeweAccount;
      toWxid: string;
      appmsg: string;
    }) => Promise<unknown>;
  };

  assert.equal(typeof sendModule.sendAppMsgGewe, "function");

  await withMockFetch(async (calls) => {
    await sendModule.sendAppMsgGewe?.({
      account: createAccount(),
      toWxid: "wxid_target",
      appmsg: "<appmsg><title>引用消息</title></appmsg>",
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /\/gewe\/v2\/api\/message\/postAppMsg$/);
    const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as {
      appId?: string;
      toWxid?: string;
      appmsg?: string;
    };
    assert.deepEqual(body, {
      appId: "app-rich",
      toWxid: "wxid_target",
      appmsg: "<appmsg><title>引用消息</title></appmsg>",
    });
  });
});

test("deliverGewePayload 在 appMsg 存在时会优先发送 GeWe 富消息", async () => {
  installRuntime();
  const deliveryModule = (await import("./delivery.ts")) as {
    deliverGewePayload?: (params: {
      payload: {
        text?: string;
        channelData?: Record<string, unknown>;
      };
      account: ResolvedGeweAccount;
      cfg: {};
      toWxid: string;
    }) => Promise<unknown>;
  };

  await withMockFetch(async (calls) => {
    await deliveryModule.deliverGewePayload?.({
      payload: {
        text: "这段纯文本不应抢占 appMsg",
        channelData: {
          "gewe-openclaw": {
            appMsg: {
              appmsg: "<appmsg><title>富消息优先</title></appmsg>",
            },
          },
        },
      },
      account: createAccount(),
      cfg: {},
      toWxid: "wxid_target",
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /\/gewe\/v2\/api\/message\/postAppMsg$/);
  });
});

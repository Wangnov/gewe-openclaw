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

test("sendEmojiGewe 会向 GeWe postEmoji 发送 emoji 元数据", async () => {
  installRuntime();
  const sendModule = (await import("./send.ts")) as {
    sendEmojiGewe?: (params: {
      account: ResolvedGeweAccount;
      toWxid: string;
      emojiMd5: string;
      emojiSize: number;
    }) => Promise<unknown>;
  };

  assert.equal(typeof sendModule.sendEmojiGewe, "function");

  await withMockFetch(async (calls) => {
    await sendModule.sendEmojiGewe?.({
      account: createAccount(),
      toWxid: "wxid_target",
      emojiMd5: "4cc7540a85b5b6cf4ba14e9f4ae08b7c",
      emojiSize: 102357,
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /\/gewe\/v2\/api\/message\/postEmoji$/);
    const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as {
      appId?: string;
      toWxid?: string;
      emojiMd5?: string;
      emojiSize?: number;
    };
    assert.deepEqual(body, {
      appId: "app-rich",
      toWxid: "wxid_target",
      emojiMd5: "4cc7540a85b5b6cf4ba14e9f4ae08b7c",
      emojiSize: 102357,
    });
  });
});

test("deliverGewePayload 在 emoji 存在时会优先发送 GeWe emoji", async () => {
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
        text: "这段纯文本不应抢占 emoji",
        channelData: {
          "gewe-openclaw": {
            emoji: {
              emojiMd5: "4cc7540a85b5b6cf4ba14e9f4ae08b7c",
              emojiSize: 102357,
            },
          },
        },
      },
      account: createAccount(),
      cfg: {},
      toWxid: "wxid_target",
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /\/gewe\/v2\/api\/message\/postEmoji$/);
  });
});

test("sendNameCardGewe 会向 GeWe postNameCard 发送名片元数据", async () => {
  installRuntime();
  const sendModule = (await import("./send.ts")) as {
    sendNameCardGewe?: (params: {
      account: ResolvedGeweAccount;
      toWxid: string;
      nickName: string;
      nameCardWxid: string;
    }) => Promise<unknown>;
  };

  assert.equal(typeof sendModule.sendNameCardGewe, "function");

  await withMockFetch(async (calls) => {
    await sendModule.sendNameCardGewe?.({
      account: createAccount(),
      toWxid: "wxid_target",
      nickName: "谭艳",
      nameCardWxid: "wxid_0xsqb3o0tsvz22",
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /\/gewe\/v2\/api\/message\/postNameCard$/);
    const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as {
      appId?: string;
      toWxid?: string;
      nickName?: string;
      nameCardWxid?: string;
    };
    assert.deepEqual(body, {
      appId: "app-rich",
      toWxid: "wxid_target",
      nickName: "谭艳",
      nameCardWxid: "wxid_0xsqb3o0tsvz22",
    });
  });
});

test("deliverGewePayload 在 nameCard 存在时会优先发送 GeWe 名片", async () => {
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
        text: "这段纯文本不应抢占 nameCard",
        channelData: {
          "gewe-openclaw": {
            nameCard: {
              nickName: "谭艳",
              nameCardWxid: "wxid_0xsqb3o0tsvz22",
            },
          },
        },
      },
      account: createAccount(),
      cfg: {},
      toWxid: "wxid_target",
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /\/gewe\/v2\/api\/message\/postNameCard$/);
  });
});

test("sendMiniAppGewe 会向 GeWe postMiniApp 发送小程序元数据", async () => {
  installRuntime();
  const sendModule = (await import("./send.ts")) as {
    sendMiniAppGewe?: (params: {
      account: ResolvedGeweAccount;
      toWxid: string;
      miniAppId: string;
      displayName: string;
      pagePath: string;
      coverImgUrl: string;
      title: string;
      userName: string;
    }) => Promise<unknown>;
  };

  assert.equal(typeof sendModule.sendMiniAppGewe, "function");

  await withMockFetch(async (calls) => {
    await sendModule.sendMiniAppGewe?.({
      account: createAccount(),
      toWxid: "wxid_target",
      miniAppId: "wx1234567890",
      displayName: "百果园+",
      pagePath: "pages/homeDelivery/index.html",
      coverImgUrl: "https://example.com/cover.jpg",
      title: "最快29分钟 好吃水果送到家",
      userName: "gh_690acf47ea05@app",
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /\/gewe\/v2\/api\/message\/postMiniApp$/);
    const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as Record<string, unknown>;
    assert.deepEqual(body, {
      appId: "app-rich",
      toWxid: "wxid_target",
      miniAppId: "wx1234567890",
      displayName: "百果园+",
      pagePath: "pages/homeDelivery/index.html",
      coverImgUrl: "https://example.com/cover.jpg",
      title: "最快29分钟 好吃水果送到家",
      userName: "gh_690acf47ea05@app",
    });
  });
});

test("deliverGewePayload 在 miniApp 存在时会优先发送 GeWe 小程序", async () => {
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
        text: "这段纯文本不应抢占 miniApp",
        channelData: {
          "gewe-openclaw": {
            miniApp: {
              miniAppId: "wx1234567890",
              displayName: "百果园+",
              pagePath: "pages/homeDelivery/index.html",
              coverImgUrl: "https://example.com/cover.jpg",
              title: "最快29分钟 好吃水果送到家",
              userName: "gh_690acf47ea05@app",
            },
          },
        },
      },
      account: createAccount(),
      cfg: {},
      toWxid: "wxid_target",
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /\/gewe\/v2\/api\/message\/postMiniApp$/);
  });
});

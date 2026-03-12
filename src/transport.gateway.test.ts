import test from "node:test";
import assert from "node:assert/strict";

import { downloadGeweImage } from "./download.ts";
import { sendTextGewe } from "./send.ts";
import type { ResolvedGeweAccount } from "./types.ts";

function createGatewayAccount(): ResolvedGeweAccount {
  return {
    accountId: "default",
    enabled: true,
    mode: "gateway",
    token: "",
    tokenSource: "none",
    appId: "",
    appIdSource: "none",
    config: {
      gatewayUrl: "https://gateway.example.com",
      gatewayKey: "gateway-key",
      gatewayInstanceId: "instance-a",
      webhookPublicUrl: "https://openclaw-a.example.com/webhook",
      groups: {
        "123456@chatroom": {
          enabled: true,
        },
      },
    },
  };
}

test("gateway mode 发送文本走网关且不依赖本地 appId", async () => {
  const account = createGatewayAccount();
  const calls: Array<{ input: string; init?: RequestInit }> = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ ret: 200, msg: "ok", data: { msgId: "m1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await sendTextGewe({
      account,
      toWxid: "wxid_target",
      content: "hello",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "https://gateway.example.com/gewe/v2/api/message/postText");
  const headers = calls[0]?.init?.headers as Record<string, string>;
  assert.equal(headers["X-GeWe-Gateway-Key"], "gateway-key");
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.deepEqual(body, {
    toWxid: "wxid_target",
    content: "hello",
  });
});

test("gateway mode 下载图片走网关且不依赖本地 appId", async () => {
  const account = createGatewayAccount();
  const calls: Array<{ input: string; init?: RequestInit }> = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(
      JSON.stringify({ ret: 200, msg: "ok", data: { fileUrl: "https://files.example.com/a.jpg" } }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const result = await downloadGeweImage({
      account,
      xml: "<msg/>",
      type: 2,
    });
    assert.equal(result, "https://files.example.com/a.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "https://gateway.example.com/gewe/v2/api/message/downloadImage");
  const headers = calls[0]?.init?.headers as Record<string, string>;
  assert.equal(headers["X-GeWe-Gateway-Key"], "gateway-key");
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.deepEqual(body, {
    xml: "<msg/>",
    type: 2,
  });
});

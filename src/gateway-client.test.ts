import test from "node:test";
import assert from "node:assert/strict";

import { registerGatewayInstance } from "./gateway-client.ts";
import type { ResolvedGeweAccount } from "./types.ts";

function createGatewayAccount(): ResolvedGeweAccount {
  return {
    accountId: "default",
    enabled: true,
    token: "",
    tokenSource: "none",
    appId: "",
    appIdSource: "none",
    config: {
      gatewayUrl: "https://gateway.example.com",
      gatewayKey: "gateway-key",
      gatewayInstanceId: "instance-a",
      webhookPublicUrl: "https://openclaw-a.example.com/webhook",
      webhookSecret: "secret-a",
      groups: {
        "123456@chatroom": {
          enabled: true,
        },
      },
    },
  };
}

test("registerGatewayInstance 使用 gateway key 和实例声明发起注册", async () => {
  const account = createGatewayAccount();
  const calls: Array<{ input: string; init?: RequestInit }> = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await registerGatewayInstance({
      account,
      pluginVersion: "2026.3.13",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "https://gateway.example.com/gateway/v1/instances/register");
  assert.equal(calls[0]?.init?.headers instanceof Headers, false);
  const headers = calls[0]?.init?.headers as Record<string, string>;
  assert.equal(headers["X-GeWe-Gateway-Key"], "gateway-key");

  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.deepEqual(body, {
    instanceId: "instance-a",
    callbackUrl: "https://openclaw-a.example.com/webhook",
    callbackSecret: "secret-a",
    groups: ["123456@chatroom"],
    pluginVersion: "2026.3.13",
  });
});

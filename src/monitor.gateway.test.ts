import test from "node:test";
import assert from "node:assert/strict";

import { monitorGeweProvider } from "./monitor.ts";
import { setGeweRuntime } from "./runtime.ts";
import type { CoreConfig } from "./types.ts";

test("gateway mode 启动 webhook 时会注册并注销网关实例", async () => {
  const cfg = {
    channels: {
      "gewe-openclaw": {
        gatewayUrl: "https://gateway.example.com",
        gatewayKey: "gateway-key",
        gatewayInstanceId: "instance-a",
        webhookHost: "127.0.0.1",
        webhookPort: 0,
        webhookPath: "/webhook",
        webhookPublicUrl: "https://openclaw-a.example.com/webhook",
        groups: {
          "123456@chatroom": {
            enabled: true,
          },
        },
      },
    },
  } satisfies CoreConfig;

  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const runtimeLogs: string[] = [];
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 25);
  setGeweRuntime({
    config: {
      loadConfig: () => cfg,
    },
    logging: {
      getChildLogger: () => ({
        info: (message: string) => runtimeLogs.push(message),
        error: (message: string) => runtimeLogs.push(`ERR:${message}`),
      }),
    },
    channel: {
      text: {
        hasControlCommand: () => false,
      },
    },
  } as never);

  try {
    await monitorGeweProvider({
      config: cfg,
      abortSignal: controller.signal,
      runtime: {
        log: (message) => runtimeLogs.push(message),
        error: (message) => runtimeLogs.push(`ERR:${message}`),
        exit: () => {
          throw new Error("exit not expected");
        },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(
    calls.some((call) => call.input === "https://gateway.example.com/gateway/v1/instances/register"),
  );
  assert.ok(
    calls.some(
      (call) => call.input === "https://gateway.example.com/gateway/v1/instances/unregister",
    ),
  );
  assert.ok(runtimeLogs.some((entry) => entry.includes("registered GeWe gateway instance")));
});

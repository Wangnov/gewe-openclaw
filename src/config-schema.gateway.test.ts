import test from "node:test";
import assert from "node:assert/strict";

import { GeweConfigSchema } from "./config-schema.ts";

test("gateway mode 允许不配置 token/appId", () => {
  const result = GeweConfigSchema.safeParse({
    gatewayUrl: "https://gateway.example.com",
    gatewayKey: "gateway-key",
    gatewayInstanceId: "instance-a",
    webhookPublicUrl: "https://openclaw-a.example.com/webhook",
    groups: {
      "123456@chatroom": {
        enabled: true,
      },
    },
  });

  assert.equal(result.success, true);
});

test("gateway mode 要求 gatewayUrl 和 gatewayKey 成对出现", () => {
  const result = GeweConfigSchema.safeParse({
    gatewayUrl: "https://gateway.example.com",
    gatewayInstanceId: "instance-a",
    webhookPublicUrl: "https://openclaw-a.example.com/webhook",
    groups: {
      "123456@chatroom": {
        enabled: true,
      },
    },
  });

  assert.equal(result.success, false);
  assert.match(JSON.stringify(result.error?.issues ?? []), /gatewayKey/i);
});

test("gateway mode 要求显式群列表且不允许通配符", () => {
  const result = GeweConfigSchema.safeParse({
    gatewayUrl: "https://gateway.example.com",
    gatewayKey: "gateway-key",
    gatewayInstanceId: "instance-a",
    webhookPublicUrl: "https://openclaw-a.example.com/webhook",
    groups: {
      "*": {
        enabled: true,
      },
    },
  });

  assert.equal(result.success, false);
  assert.match(JSON.stringify(result.error?.issues ?? []), /groups/i);
});

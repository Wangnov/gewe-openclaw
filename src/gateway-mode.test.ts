import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveGeweAccount,
  resolveGeweTransportBaseUrl,
  resolveGatewayGroupBindings,
  resolveIsGatewayMode,
} from "./accounts.ts";
import type { CoreConfig } from "./types.ts";

test("gateway mode 下账号可不提供 token/appId 且 transport 指向 gatewayUrl", () => {
  const cfg = {
    channels: {
      "gewe-openclaw": {
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
    },
  } satisfies CoreConfig;

  const account = resolveGeweAccount({ cfg });

  assert.equal(resolveIsGatewayMode(account), true);
  assert.equal(account.token, "");
  assert.equal(account.appId, "");
  assert.equal(resolveGeweTransportBaseUrl(account), "https://gateway.example.com");
  assert.deepEqual(resolveGatewayGroupBindings(account), ["123456@chatroom"]);
});

test("直连模式继续回退默认 GeWe apiBaseUrl", () => {
  const cfg = {
    channels: {
      "gewe-openclaw": {
        token: "token",
        appId: "app-id",
      },
    },
  } satisfies CoreConfig;

  const account = resolveGeweAccount({ cfg });

  assert.equal(resolveIsGatewayMode(account), false);
  assert.equal(resolveGeweTransportBaseUrl(account), "https://www.geweapi.com");
});

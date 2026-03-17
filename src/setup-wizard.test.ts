import test from "node:test";
import assert from "node:assert/strict";

import { gewePlugin } from "./channel.ts";

test("GeWe 暴露 setupWizard 供 openclaw onboard 使用", async () => {
  assert.ok(gewePlugin.setupWizard);
  assert.equal(gewePlugin.setupWizard?.channel, "gewe-openclaw");

  const configured = await gewePlugin.setupWizard?.status.resolveConfigured({
    cfg: {
      channels: {
        "gewe-openclaw": {
          token: "token-1",
          appId: "app-1",
        },
      },
    },
  });

  assert.equal(configured, true);
});

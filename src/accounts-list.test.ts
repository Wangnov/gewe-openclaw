import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";

import { listGeweAccountIds, resolveDefaultGeweAccountId } from "./accounts.ts";
import type { CoreConfig } from "./types.ts";

function createConfig(): CoreConfig {
  return {
    channels: {
      "gewe-openclaw": {
        token: "default-token",
        appId: "default-app",
        accounts: {
          "acct-b": {
            token: "token-b",
            appId: "app-b",
          },
        },
      },
    },
  };
}

test("GeWe 账号列表会保留顶层 default 账号", () => {
  assert.deepEqual(listGeweAccountIds(createConfig()), ["acct-b", DEFAULT_ACCOUNT_ID]);
});

test("GeWe 默认账号解析会优先返回顶层 default 账号", () => {
  assert.equal(resolveDefaultGeweAccountId(createConfig()), DEFAULT_ACCOUNT_ID);
});

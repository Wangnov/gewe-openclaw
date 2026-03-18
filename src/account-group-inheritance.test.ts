import assert from "node:assert/strict";
import test from "node:test";

import { resolveGeweAccount } from "./accounts.ts";
import { resolveGeweGroupToolPolicy } from "./policy.ts";
import type { CoreConfig } from "./types.ts";

function createConfig(): CoreConfig {
  return {
    channels: {
      "gewe-openclaw": {
        dms: {
          "*": {
            skills: ["shared-dm-skill"],
            reply: {
              mode: "quote_source",
            },
          },
        },
        groups: {
          "*": {
            skills: ["shared-skill"],
            tools: {
              allow: ["message.send"],
            },
          },
        },
        accounts: {
          "acct-1": {
            dms: {
              "wxid_friend": {
                trigger: {
                  mode: "quote",
                },
              },
            },
            groups: {
              "room@chatroom": {
                requireMention: false,
              },
            },
          },
        },
      },
    },
  };
}

test("GeWe 命名账号会继承顶层 groups 默认配置", () => {
  const account = resolveGeweAccount({
    cfg: createConfig(),
    accountId: "acct-1",
  });

  assert.deepEqual(account.config.groups, {
    "*": {
      skills: ["shared-skill"],
      tools: {
        allow: ["message.send"],
      },
    },
    "room@chatroom": {
      requireMention: false,
    },
  });
});

test("GeWe 命名账号会继承顶层 dms 默认配置", () => {
  const account = resolveGeweAccount({
    cfg: createConfig(),
    accountId: "acct-1",
  });

  assert.deepEqual(account.config.dms, {
    "*": {
      skills: ["shared-dm-skill"],
      reply: {
        mode: "quote_source",
      },
    },
    "wxid_friend": {
      trigger: {
        mode: "quote",
      },
    },
  });
});

test("GeWe 命名账号的 group tool policy 会回退到顶层 wildcard 配置", () => {
  const tools = resolveGeweGroupToolPolicy({
    cfg: createConfig(),
    accountId: "acct-1",
    groupId: "room@chatroom",
  } as never);

  assert.deepEqual(tools, {
    allow: ["message.send"],
  });
});

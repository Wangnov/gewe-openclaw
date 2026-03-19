import assert from "node:assert/strict";
import test from "node:test";

import { GeweConfigSchema } from "./config-schema.ts";
import {
  resolveGeweDmReplyMode,
  resolveGeweDmTriggerMode,
  resolveGeweGroupReplyMode,
  resolveGeweGroupTriggerMode,
} from "./policy.ts";

test("GeWe 配置支持 group/dm trigger 与 reply 规则", () => {
  const parsed = GeweConfigSchema.safeParse({
    dmPolicy: "open",
    allowFrom: ["*"],
    groups: {
      "*": {
        trigger: { mode: "at_or_quote" },
        reply: { mode: "at_sender" },
        bindingIdentity: {
          selfNickname: { source: "agent_name" },
          remark: { source: "agent_id" },
        },
      },
    },
    dms: {
      "*": {
        trigger: { mode: "quote" },
        reply: { mode: "quote_source" },
        skills: ["alpha-skill"],
        systemPrompt: "Use alpha",
      },
    },
  });

  assert.equal(parsed.success, true);
});

test("GeWe 群 bindingIdentity 的 literal 模式要求提供 value", () => {
  const parsed = GeweConfigSchema.safeParse({
    dmPolicy: "open",
    allowFrom: ["*"],
    groups: {
      "*": {
        bindingIdentity: {
          selfNickname: { source: "literal" },
        },
      },
    },
  });

  assert.equal(parsed.success, false);
});

test("GeWe DM reply 规则不接受群聊专属 at 模式", () => {
  const parsed = GeweConfigSchema.safeParse({
    dmPolicy: "open",
    allowFrom: ["*"],
    dms: {
      "*": {
        reply: { mode: "at_sender" },
      },
    },
  });

  assert.equal(parsed.success, false);
});

test("GeWe group trigger.mode 优先于 legacy requireMention，并统一使用 at 术语", () => {
  assert.equal(
    resolveGeweGroupTriggerMode({
      groupConfig: {
        requireMention: true,
        trigger: { mode: "any_message" },
      },
    }),
    "any_message",
  );

  assert.equal(
    resolveGeweGroupTriggerMode({
      wildcardConfig: {
        requireMention: true,
      },
    }),
    "at",
  );

  assert.equal(resolveGeweGroupTriggerMode({}), "at");
});

test("GeWe DM trigger 与 reply 默认值会按新规则回退", () => {
  assert.equal(resolveGeweDmTriggerMode({}), "any_message");
  assert.equal(resolveGeweDmReplyMode({ autoQuoteReply: true }), "quote_source");
  assert.equal(resolveGeweDmReplyMode({ autoQuoteReply: false }), "plain");
});

test("GeWe group reply 默认值会在未显式配置时回退到 autoQuoteReply", () => {
  assert.equal(resolveGeweGroupReplyMode({ autoQuoteReply: true }), "quote_source");
  assert.equal(resolveGeweGroupReplyMode({ autoQuoteReply: false }), "plain");
  assert.equal(
    resolveGeweGroupReplyMode({
      wildcardConfig: {
        reply: { mode: "quote_and_at" },
      },
      autoQuoteReply: false,
    }),
    "quote_and_at_compat",
  );
});

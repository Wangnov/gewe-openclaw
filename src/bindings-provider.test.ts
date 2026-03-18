import assert from "node:assert/strict";
import test from "node:test";

import { gewePlugin } from "./channel.ts";

test("GeWe bindings provider 会把配置中的会话 ID 归一到 canonical conversationId", () => {
  const compiled = gewePlugin.bindings?.compileConfiguredBinding({
    binding: {
      type: "acp",
      agentId: "ops",
      match: {
        channel: "gewe-openclaw",
        peer: {
          kind: "group",
          id: "34757816141@chatroom",
        },
      },
      acp: {
        backend: "acpx",
      },
    } as never,
    conversationId: "gewe:group:34757816141@chatroom",
  });

  assert.deepEqual(compiled, {
    conversationId: "34757816141@chatroom",
  });
});

test("GeWe bindings provider 只匹配同一个群/私聊会话", () => {
  const match = gewePlugin.bindings?.matchInboundConversation({
    binding: {
      type: "acp",
      agentId: "ops",
      match: {
        channel: "gewe-openclaw",
        peer: {
          kind: "group",
          id: "34757816141@chatroom",
        },
      },
      acp: {
        backend: "acpx",
      },
    } as never,
    compiledBinding: {
      conversationId: "34757816141@chatroom",
    },
    conversationId: "34757816141@chatroom",
    parentConversationId: undefined,
  });

  assert.deepEqual(match, {
    conversationId: "34757816141@chatroom",
    matchPriority: 2,
  });
  assert.equal(
    gewePlugin.bindings?.matchInboundConversation({
      binding: {} as never,
      compiledBinding: {
        conversationId: "34757816141@chatroom",
      },
      conversationId: "another@chatroom",
      parentConversationId: undefined,
    }),
    null,
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import { applyGeweReplyModeToPayload, resolveGeweReplyOptions } from "./reply-options.ts";

test("GeWe 默认开启 block streaming", () => {
  assert.deepEqual(resolveGeweReplyOptions({ config: {} }), {
    disableBlockStreaming: false,
  });
});

test("GeWe 显式关闭 block streaming 时传递 disableBlockStreaming=true", () => {
  assert.deepEqual(resolveGeweReplyOptions({ config: { blockStreaming: false } }), {
    disableBlockStreaming: true,
  });
});

test("GeWe 显式开启 block streaming 时传递 disableBlockStreaming=false", () => {
  assert.deepEqual(resolveGeweReplyOptions({ config: { blockStreaming: true } }), {
    disableBlockStreaming: false,
  });
});

test("GeWe quote_source reply 模式会在首条回复上补 replyToId", () => {
  const repliedRef = { value: false };
  assert.deepEqual(
    applyGeweReplyModeToPayload(
      {
        text: "hello",
      },
      {
        mode: "quote_source",
        isGroup: true,
        senderId: "wxid_sender",
        defaultReplyToId: "msg-123",
        repliedRef,
      },
    ),
    {
      text: "hello",
      replyToId: "msg-123",
    },
  );
  assert.equal(repliedRef.value, true);
});

test("GeWe at_sender reply 模式会为群文本补 ats", () => {
  assert.deepEqual(
    applyGeweReplyModeToPayload(
      {
        text: "hello",
      },
      {
        mode: "at_sender",
        isGroup: true,
        senderId: "wxid_sender",
      },
    ),
    {
      text: "hello",
      channelData: {
        "gewe-openclaw": {
          ats: "wxid_sender",
        },
      },
    },
  );
});

test("GeWe at_sender reply 模式会在有 senderName 时补 @昵称 前缀", () => {
  assert.deepEqual(
    applyGeweReplyModeToPayload(
      {
        text: "hello",
      },
      {
        mode: "at_sender",
        isGroup: true,
        senderId: "wxid_sender",
        senderName: "CLAsh",
      },
    ),
    {
      text: "@CLAsh\u2005hello",
      channelData: {
        "gewe-openclaw": {
          ats: "wxid_sender",
        },
      },
    },
  );
});

test("GeWe at_sender reply 模式会移除默认注入的 replyToId", () => {
  assert.deepEqual(
    applyGeweReplyModeToPayload(
      {
        text: "hello",
        replyToId: "msg-123",
      },
      {
        mode: "at_sender",
        isGroup: true,
        senderId: "wxid_sender",
        defaultReplyToId: "msg-123",
      },
    ),
    {
      text: "hello",
      channelData: {
        "gewe-openclaw": {
          ats: "wxid_sender",
        },
      },
    },
  );
});

test("GeWe plain reply 模式会移除默认注入的 replyToId", () => {
  assert.deepEqual(
    applyGeweReplyModeToPayload(
      {
        text: "hello",
        replyToId: "msg-123",
      },
      {
        mode: "plain",
        isGroup: true,
        defaultReplyToId: "msg-123",
      },
    ),
    {
      text: "hello",
    },
  );
});

test("GeWe quote_and_at 在非文本 payload 上会退化为 quote_source", () => {
  assert.deepEqual(
    applyGeweReplyModeToPayload(
      {
        mediaUrl: "https://example.com/test.png",
      },
      {
        mode: "quote_and_at",
        isGroup: true,
        senderId: "wxid_sender",
        defaultReplyToId: "msg-123",
        repliedRef: { value: false },
      },
    ),
    {
      mediaUrl: "https://example.com/test.png",
      replyToId: "msg-123",
    },
  );
});

test("GeWe quote_and_at 会同时补引用和 @昵称 前缀", () => {
  assert.deepEqual(
    applyGeweReplyModeToPayload(
      {
        text: "hello",
      },
      {
        mode: "quote_and_at",
        isGroup: true,
        senderId: "wxid_sender",
        senderName: "CLAsh",
        defaultReplyToId: "msg-123",
        repliedRef: { value: false },
      },
    ),
    {
      text: "@CLAsh\u2005hello",
      replyToId: "msg-123",
      channelData: {
        "gewe-openclaw": {
          ats: "wxid_sender",
        },
      },
    },
  );
});

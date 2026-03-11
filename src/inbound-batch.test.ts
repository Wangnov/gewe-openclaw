import assert from "node:assert/strict";
import test from "node:test";

import type { OpenClawConfig } from "openclaw/plugin-sdk";

import type { GeweInboundMessage } from "./types.js";
import {
  buildGeweInboundMediaPayload,
  buildGeweInboundMessageMeta,
  createGeweInboundDebouncer,
  resolveGeweInboundDebounceMs,
} from "./inbound-batch.ts";

function createMessage(overrides: Partial<GeweInboundMessage> = {}): GeweInboundMessage {
  return {
    messageId: overrides.messageId ?? "1",
    newMessageId: overrides.newMessageId ?? overrides.messageId ?? "1",
    appId: overrides.appId ?? "app-1",
    botWxid: overrides.botWxid ?? "wxid_bot",
    fromId: overrides.fromId ?? "wxid_sender",
    toId: overrides.toId ?? "wxid_bot",
    senderId: overrides.senderId ?? "wxid_sender",
    senderName: overrides.senderName ?? "sender",
    text: overrides.text ?? "hello",
    msgType: overrides.msgType ?? 1,
    xml: overrides.xml,
    timestamp: overrides.timestamp ?? Date.now(),
    isGroupChat: overrides.isGroupChat ?? false,
  };
}

test("resolveGeweInboundDebounceMs defaults to 1000ms when global inbound debounce is unset", () => {
  const cfg = {} as OpenClawConfig;

  assert.equal(resolveGeweInboundDebounceMs(cfg), 1000);
});

test("resolveGeweInboundDebounceMs prefers per-channel override over global inbound debounce", () => {
  const cfg = {
    messages: {
      inbound: {
        debounceMs: 250,
        byChannel: {
          "gewe-openclaw": 800,
        },
      },
    },
  } as OpenClawConfig;

  assert.equal(resolveGeweInboundDebounceMs(cfg), 800);
});

test("buildGeweInboundMessageMeta includes first, last, and all message ids for merged batches", () => {
  const meta = buildGeweInboundMessageMeta([
    createMessage({ messageId: "m1", newMessageId: "n1" }),
    createMessage({ messageId: "m2", newMessageId: "n2" }),
    createMessage({ messageId: "m3", newMessageId: "n3" }),
  ]);

  assert.equal(meta.messageSid, "n3");
  assert.equal(meta.messageSidFull, "n3");
  assert.deepEqual(meta.messageSids, ["n1", "n2", "n3"]);
  assert.equal(meta.messageSidFirst, "n1");
  assert.equal(meta.messageSidLast, "n3");
});

test("buildGeweInboundMediaPayload includes single and array media fields", () => {
  const payload = buildGeweInboundMediaPayload([
    { path: "/tmp/one.jpg", contentType: "image/jpeg" },
    { path: "/tmp/two.mp3", contentType: "audio/mpeg" },
  ]);

  assert.equal(payload.MediaPath, "/tmp/one.jpg");
  assert.equal(payload.MediaType, "image/jpeg");
  assert.equal(payload.MediaUrl, "/tmp/one.jpg");
  assert.deepEqual(payload.MediaPaths, ["/tmp/one.jpg", "/tmp/two.mp3"]);
  assert.deepEqual(payload.MediaUrls, ["/tmp/one.jpg", "/tmp/two.mp3"]);
  assert.deepEqual(payload.MediaTypes, ["image/jpeg", "audio/mpeg"]);
});

test("createGeweInboundDebouncer merges adjacent messages from the same sender and conversation", async () => {
  const flushed: string[][] = [];
  const debouncer = createGeweInboundDebouncer({
    cfg: {
      messages: {
        inbound: {
          debounceMs: 20,
        },
      },
    } as OpenClawConfig,
    accountId: "acct-1",
    isControlCommand: () => false,
    onFlush: async (messages) => {
      flushed.push(messages.map((message) => message.newMessageId));
    },
  });

  await debouncer.enqueue(createMessage({ newMessageId: "a1", text: "first" }));
  await debouncer.enqueue(createMessage({ newMessageId: "a2", text: "second" }));

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.deepEqual(flushed, [["a1", "a2"]]);
});

test("createGeweInboundDebouncer flushes pending messages before dispatching a control command", async () => {
  const flushed: string[][] = [];
  const debouncer = createGeweInboundDebouncer({
    cfg: {
      messages: {
        inbound: {
          debounceMs: 30,
        },
      },
    } as OpenClawConfig,
    accountId: "acct-1",
    isControlCommand: (text) => text.trim().startsWith("/"),
    onFlush: async (messages) => {
      flushed.push(messages.map((message) => message.newMessageId));
    },
  });

  await debouncer.enqueue(createMessage({ newMessageId: "b1", text: "hello" }));
  await debouncer.enqueue(createMessage({ newMessageId: "b2", text: "/new" }));

  assert.deepEqual(flushed, [["b1"], ["b2"]]);
});

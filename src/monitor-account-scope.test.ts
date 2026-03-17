import assert from "node:assert/strict";
import test from "node:test";

import { buildGeweInboundDedupeKey } from "./monitor.ts";
import type { GeweInboundMessage } from "./types.ts";

function createMessage(overrides: Partial<GeweInboundMessage> = {}): GeweInboundMessage {
  return {
    messageId: overrides.messageId ?? "1",
    newMessageId: overrides.newMessageId ?? "1",
    appId: overrides.appId ?? "shared-app",
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

test("GeWe inbound 去重键按 accountId 作用域隔离", () => {
  const message = createMessage({ appId: "shared-app", newMessageId: "42" });

  assert.notEqual(
    buildGeweInboundDedupeKey({ accountId: "acct-a", message }),
    buildGeweInboundDedupeKey({ accountId: "acct-b", message }),
  );
});

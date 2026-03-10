import test from "node:test";
import assert from "node:assert/strict";

import { resolveGeweReplyOptions } from "./reply-options.ts";

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

import assert from "node:assert/strict";
import test from "node:test";

import { gewePlugin } from "./channel.ts";

test("GeWe outbound 暴露默认 textChunkLimit 供宿主应用 chunk 配置", () => {
  assert.equal(gewePlugin.outbound?.textChunkLimit, 4000);
  assert.equal(gewePlugin.outbound?.chunkerMode, "markdown");
});

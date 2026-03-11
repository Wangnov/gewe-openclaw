import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { resolveOpenClawStateDir, resolveUserPath } from "./state-paths.ts";

test("OPENCLAW_STATE_DIR 优先级最高", () => {
  const result = resolveOpenClawStateDir(
    {
      OPENCLAW_STATE_DIR: "~/custom-openclaw",
      CLAWDBOT_STATE_DIR: "~/legacy-clawdbot",
    },
    () => "/Users/tester",
    () => false,
  );

  assert.equal(result, path.resolve("/Users/tester/custom-openclaw"));
});

test("存在 .openclaw 时优先返回 .openclaw", () => {
  const result = resolveOpenClawStateDir(
    {},
    () => "/Users/tester",
    (candidate) => candidate === "/Users/tester/.openclaw",
  );

  assert.equal(result, "/Users/tester/.openclaw");
});

test("不存在 .openclaw 时回退到已存在的 legacy 目录", () => {
  const result = resolveOpenClawStateDir(
    {},
    () => "/Users/tester",
    (candidate) => candidate === "/Users/tester/.moltbot",
  );

  assert.equal(result, "/Users/tester/.moltbot");
});

test("没有任何现存目录时默认返回 .openclaw", () => {
  const result = resolveOpenClawStateDir({}, () => "/Users/tester", () => false);
  assert.equal(result, "/Users/tester/.openclaw");
});

test("resolveUserPath 会展开用户目录", () => {
  const result = resolveUserPath("~/nested/file.txt", () => "/Users/tester");
  assert.equal(result, path.resolve("/Users/tester/nested/file.txt"));
});

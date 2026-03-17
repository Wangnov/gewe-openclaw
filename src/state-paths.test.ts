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

test("CLAWDBOT_STATE_DIR 作为兼容别名生效", () => {
  const result = resolveOpenClawStateDir(
    {
      CLAWDBOT_STATE_DIR: "~/legacy-clawdbot",
    },
    () => "/Users/tester",
    () => false,
  );

  assert.equal(result, path.resolve("/Users/tester/legacy-clawdbot"));
});

test("OPENCLAW_HOME 会影响默认 state dir", () => {
  const result = resolveOpenClawStateDir(
    {
      OPENCLAW_HOME: "/srv/openclaw-home",
    },
    () => "/Users/tester",
    () => false,
  );

  assert.equal(result, path.resolve("/srv/openclaw-home/.openclaw"));
});

test("存在 .openclaw 时优先返回 .openclaw", () => {
  const result = resolveOpenClawStateDir(
    {},
    () => "/Users/tester",
    (candidate) => candidate === "/Users/tester/.openclaw",
  );

  assert.equal(result, "/Users/tester/.openclaw");
});

test("不存在 .openclaw 时即便 legacy 目录存在也默认返回 .openclaw", () => {
  const result = resolveOpenClawStateDir(
    {},
    () => "/Users/tester",
    (candidate) => candidate === "/Users/tester/.moltbot",
  );

  assert.equal(result, "/Users/tester/.openclaw");
});

test("没有任何现存目录时默认返回 .openclaw", () => {
  const result = resolveOpenClawStateDir({}, () => "/Users/tester", () => false);
  assert.equal(result, "/Users/tester/.openclaw");
});

test("resolveUserPath 会展开用户目录", () => {
  const result = resolveUserPath("~/nested/file.txt", {}, () => "/Users/tester");
  assert.equal(result, path.resolve("/Users/tester/nested/file.txt"));
});

test("resolveUserPath 对 ~ 优先使用 OPENCLAW_HOME", () => {
  const result = resolveUserPath(
    "~/nested/file.txt",
    {
      OPENCLAW_HOME: "/srv/openclaw-home",
    },
    () => "/Users/tester",
  );
  assert.equal(result, path.resolve("/srv/openclaw-home/nested/file.txt"));
});

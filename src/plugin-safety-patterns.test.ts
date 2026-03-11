import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf-8");
}

test("delivery.ts 不再直接使用 child_process 管道", () => {
  const source = readSource("src/delivery.ts");
  assert.doesNotMatch(source, /node:child_process/);
  assert.doesNotMatch(source, /\bspawn\s*\(/);
});

test("inbound.ts 不再直接使用 child_process 管道", () => {
  const source = readSource("src/inbound.ts");
  assert.doesNotMatch(source, /node:child_process/);
  assert.doesNotMatch(source, /\bspawn\s*\(/);
});

test("silk.ts 不再在同一文件里读取 process.env", () => {
  const source = readSource("src/silk.ts");
  assert.doesNotMatch(source, /process\.env/);
});

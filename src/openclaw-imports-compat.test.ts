import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const DIRECT_SDK_IMPORT_RE = /from\s+["']openclaw\/plugin-sdk(?:\/[^"']*)?["']/;

function listTsFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listTsFiles(abs));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      result.push(abs);
    }
  }
  return result;
}

test("OpenClaw SDK imports are centralized in openclaw-compat", () => {
  const files = [
    path.join(rootDir, "index.ts"),
    path.join(rootDir, "setup-entry.ts"),
    ...listTsFiles(path.join(rootDir, "src")),
  ].filter((filePath) => path.resolve(filePath) !== path.join(rootDir, "src", "openclaw-compat.ts"));

  const offenders = files.filter((filePath) =>
    DIRECT_SDK_IMPORT_RE.test(fs.readFileSync(filePath, "utf-8")),
  );

  assert.deepEqual(
    offenders.map((filePath) => path.relative(rootDir, filePath)).sort(),
    [],
  );
});

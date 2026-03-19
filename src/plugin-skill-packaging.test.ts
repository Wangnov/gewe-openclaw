import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");

test("plugin manifest declares bundled skills directory", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(rootDir, "openclaw.plugin.json"), "utf-8"),
  ) as { skills?: string[] };

  assert.deepEqual(manifest.skills, ["./skills"]);
});

test("package publish whitelist includes skills directory", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8")) as {
    files?: string[];
  };

  assert.ok(pkg.files?.includes("skills/**"));
});

test("gewe channel rules skill exists with expected core guidance", () => {
  const skillPath = path.join(rootDir, "skills", "gewe-channel-rules", "SKILL.md");
  const content = fs.readFileSync(skillPath, "utf-8");

  assert.match(content, /"always":\s*true/);
  assert.match(content, /微信不支持 Markdown/);
  assert.match(content, /回复避免长篇大论/);
  assert.match(content, /优先转成图片或文件发送/);
  assert.match(content, /纯文本短段落和简单序号/);
  assert.match(content, /GEWE_QUOTE_PARTIAL/);
});

test("gewe agent tools skill exists with expected tool guidance", () => {
  const skillPath = path.join(rootDir, "skills", "gewe-agent-tools", "SKILL.md");
  const content = fs.readFileSync(skillPath, "utf-8");

  assert.match(content, /skillKey":\s*"gewe-agent-tools"/);
  assert.match(content, /gewe_contacts/);
  assert.match(content, /gewe_groups/);
  assert.match(content, /gewe_moments/);
  assert.match(content, /gewe_personal/);
  assert.match(content, /gewe_issue_group_claim_code/);
  assert.match(content, /新群/);
  assert.match(content, /认领码/);
  assert.match(content, /不要先让用户手填群 id/i);
  assert.match(content, /不要加.*认领码.*前缀/);
  assert.match(content, /当前私聊会话/);
  assert.match(content, /当前群会话/);
  assert.match(content, /会改真实微信状态/);
});

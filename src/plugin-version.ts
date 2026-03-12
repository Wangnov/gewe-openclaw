import { readFileSync } from "node:fs";

let cachedVersion: string | undefined;

export function resolvePluginVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    const version = parsed.version?.trim();
    cachedVersion = version || "0.0.0";
  } catch {
    cachedVersion = "0.0.0";
  }
  return cachedVersion;
}

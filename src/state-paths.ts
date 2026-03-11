import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveUserPath(input: string, homedir: () => string = os.homedir): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, homedir());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
}

export function resolveOpenClawStateDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
  exists: (target: string) => boolean = existsSync,
): string {
  const override = env.OPENCLAW_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
  if (override) return resolveUserPath(override, homedir);

  const home = homedir();
  const newDir = path.join(home, ".openclaw");
  const legacyDirs = [".clawdbot", ".moltbot", ".moldbot"].map((dir) => path.join(home, dir));

  try {
    if (exists(newDir)) return newDir;
    const existingLegacy = legacyDirs.find((candidate) => {
      try {
        return exists(candidate);
      } catch {
        return false;
      }
    });
    if (existingLegacy) return existingLegacy;
  } catch {
    // best-effort
  }

  return newDir;
}

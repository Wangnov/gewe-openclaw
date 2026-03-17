import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function normalize(input: string | undefined): string | undefined {
  const trimmed = input?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveEffectiveHomeDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string | undefined {
  const explicitHome = normalize(env.OPENCLAW_HOME);
  if (explicitHome) {
    if (explicitHome === "~" || explicitHome.startsWith("~/") || explicitHome.startsWith("~\\")) {
      const fallbackHome =
        normalize(env.HOME) ?? normalize(env.USERPROFILE) ?? normalizeSafe(homedir);
      if (fallbackHome) {
        return path.resolve(explicitHome.replace(/^~(?=$|[\\/])/, fallbackHome));
      }
      return undefined;
    }
    return path.resolve(explicitHome);
  }

  const envHome = normalize(env.HOME);
  if (envHome) return path.resolve(envHome);

  const userProfile = normalize(env.USERPROFILE);
  if (userProfile) return path.resolve(userProfile);

  const home = normalizeSafe(homedir);
  return home ? path.resolve(home) : undefined;
}

function normalizeSafe(homedir: () => string): string | undefined {
  try {
    return normalize(homedir());
  } catch {
    return undefined;
  }
}

function resolveRequiredHomeDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  return resolveEffectiveHomeDir(env, homedir) ?? path.resolve(process.cwd());
}

export function resolveUserPath(
  input: string,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, resolveRequiredHomeDir(env, homedir));
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
  if (override) return resolveUserPath(override, env, homedir);

  const newDir = path.join(resolveRequiredHomeDir(env, homedir), ".openclaw");

  try {
    if (exists(newDir)) return newDir;
  } catch {
    // best-effort
  }

  return newDir;
}

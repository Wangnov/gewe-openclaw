import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "./openclaw-compat.js";
import { CHANNEL_ID, stripChannelPrefix } from "./constants.js";
import { resolveOpenClawStateDir } from "./state-paths.js";

const PAIR_CODE_TTL_MS = 60 * 60 * 1000;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_ATTEMPTS = 12;
const LOCK_RETRY_BASE_MS = 50;

type AllowFromStore = {
  version: 1;
  allowFrom: string[];
};

type GewePairCodeEntry = {
  code: string;
  accountId?: string;
  createdAt?: string;
};

type GewePairCodeStore = {
  version: 1;
  codes: Array<string | GewePairCodeEntry>;
};

type LegacyPairingRequest = {
  id?: string;
  code?: string;
  createdAt?: string;
  lastSeenAt?: string;
  meta?: Record<string, unknown>;
};

type LegacyPairingStore = {
  version: 1;
  requests: LegacyPairingRequest[];
};

type CanonicalPairCodeEntry = {
  code: string;
  accountId: string;
  createdAt?: string;
};

type CanonicalLegacyPairingRequest = {
  code: string;
  accountId: string;
  createdAt?: string;
  persisted: LegacyPairingRequest;
};

function resolveCredentialsDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveOpenClawStateDir(env), "credentials");
}

function safeChannelKey(channel: string): string {
  const raw = channel.trim().toLowerCase();
  if (!raw) {
    throw new Error("invalid pairing channel");
  }
  const safe = raw.replace(/[\\/:*?"<>|]/g, "_").replace(/\.\./g, "_");
  if (!safe || safe === "_") {
    throw new Error("invalid pairing channel");
  }
  return safe;
}

function safeAccountKey(accountId: string): string {
  const raw = accountId.trim().toLowerCase();
  if (!raw) {
    throw new Error("invalid pairing account id");
  }
  const safe = raw.replace(/[\\/:*?"<>|]/g, "_").replace(/\.\./g, "_");
  if (!safe || safe === "_") {
    throw new Error("invalid pairing account id");
  }
  return safe;
}

function normalizeStoreAccountId(accountId?: string): string {
  return normalizeAccountId(accountId);
}

function normalizePairCode(code: string | undefined | null): string {
  return (code ?? "").trim().toUpperCase();
}

function normalizeAllowFromEntry(entry: string | number): string {
  const normalized = stripChannelPrefix(String(entry).trim());
  if (!normalized || normalized === "*") {
    return "";
  }
  return normalized;
}

function dedupeEntries(entries: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const entry of entries) {
    const normalized = entry.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
}

function isExpired(createdAt: string | undefined, nowMs: number, allowMissing = false): boolean {
  if (!createdAt) {
    return !allowMissing;
  }
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) {
    return true;
  }
  return nowMs - parsed > PAIR_CODE_TTL_MS;
}

async function readJsonFileWithFallback<T>(
  filePath: string,
  fallback: T,
): Promise<{ value: T; exists: boolean }> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as T | null;
    return {
      value: parsed ?? fallback,
      exists: true,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        value: fallback,
        exists: false,
      };
    }
    return {
      value: fallback,
      exists: true,
    };
  }
}

async function writeJsonFileAtomically(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.${crypto.randomUUID()}.tmp`,
  );
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.chmod(tmpPath, 0o600).catch(() => {});
  await fs.rename(tmpPath, filePath);
}

async function isStaleLock(lockPath: string): Promise<boolean> {
  const stat = await fs.stat(lockPath).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      return null;
    }
    throw err;
  });
  if (!stat) {
    return true;
  }
  return Date.now() - stat.mtimeMs > LOCK_STALE_MS;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const lockPath = `${filePath}.lock`;
  for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const handle = await fs.open(lockPath, "wx");
      try {
        return await fn();
      } finally {
        await handle.close().catch(() => {});
        await fs.rm(lockPath, { force: true }).catch(() => {});
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw err;
      }
      if (await isStaleLock(lockPath)) {
        await fs.rm(lockPath, { force: true }).catch(() => {});
        continue;
      }
      if (attempt === LOCK_RETRY_ATTEMPTS - 1) {
        throw new Error(`file lock timeout for ${filePath}`);
      }
      const delayMs = Math.min(
        LOCK_RETRY_BASE_MS * 2 ** Math.min(attempt, 5),
        1_000,
      );
      await sleep(delayMs);
    }
  }
  throw new Error(`file lock timeout for ${filePath}`);
}

async function readAllowFromFile(filePath: string): Promise<string[]> {
  const { value } = await readJsonFileWithFallback<AllowFromStore>(filePath, {
    version: 1,
    allowFrom: [],
  });
  const allowFrom = Array.isArray(value.allowFrom) ? value.allowFrom : [];
  return dedupeEntries(allowFrom.map(normalizeAllowFromEntry).filter(Boolean));
}

async function addAllowFromEntry(params: {
  accountId?: string;
  entry: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ changed: boolean; allowFrom: string[] }> {
  const filePath = resolveGeweAllowFromPath(params.accountId, params.env);
  const normalizedEntry = normalizeAllowFromEntry(params.entry);
  if (!normalizedEntry) {
    return { changed: false, allowFrom: [] };
  }

  return await withFileLock(filePath, async () => {
    const current = await readAllowFromFile(filePath);
    if (current.includes(normalizedEntry)) {
      return { changed: false, allowFrom: current };
    }
    const allowFrom = [...current, normalizedEntry];
    await writeJsonFileAtomically(filePath, {
      version: 1,
      allowFrom,
    } satisfies AllowFromStore);
    return { changed: true, allowFrom };
  });
}

function canonicalizePairCodeEntry(raw: string | GewePairCodeEntry): CanonicalPairCodeEntry | null {
  if (typeof raw === "string") {
    const code = normalizePairCode(raw);
    if (!code) {
      return null;
    }
    return {
      code,
      accountId: DEFAULT_ACCOUNT_ID,
    };
  }
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const code = normalizePairCode(raw.code);
  if (!code) {
    return null;
  }
  return {
    code,
    accountId: normalizeStoreAccountId(raw.accountId),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
  };
}

function persistPairCodeEntry(entry: CanonicalPairCodeEntry): GewePairCodeEntry {
  return {
    code: entry.code,
    ...(entry.accountId !== DEFAULT_ACCOUNT_ID ? { accountId: entry.accountId } : {}),
    ...(entry.createdAt ? { createdAt: entry.createdAt } : {}),
  };
}

function canonicalizeLegacyPairingRequest(
  raw: LegacyPairingRequest,
): CanonicalLegacyPairingRequest | null {
  const code = normalizePairCode(raw.code);
  if (!code) {
    return null;
  }
  const meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  const accountIdRaw = typeof meta.accountId === "string" ? meta.accountId : undefined;
  return {
    code,
    accountId: accountIdRaw ? normalizeStoreAccountId(accountIdRaw) : DEFAULT_ACCOUNT_ID,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    persisted: {
      ...raw,
      code,
      meta,
    },
  };
}

async function redeemFromPairCodesStore(params: {
  accountId?: string;
  code: string;
  id: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ id: string; code: string; source: "pair-codes" } | null> {
  const resolvedAccountId = normalizeStoreAccountId(params.accountId);
  const targetCode = normalizePairCode(params.code);
  const filePath = resolveGewePairCodesPath(params.env);

  const matched = await withFileLock(filePath, async () => {
    const { value, exists } = await readJsonFileWithFallback<GewePairCodeStore>(filePath, {
      version: 1,
      codes: [],
    });
    const nowMs = Date.now();
    const codes = Array.isArray(value.codes) ? value.codes : [];
    let found = false;
    let changed = false;
    const nextCodes: GewePairCodeEntry[] = [];
    for (const raw of codes) {
      const entry = canonicalizePairCodeEntry(raw);
      if (!entry) {
        changed = true;
        continue;
      }
      if (isExpired(entry.createdAt, nowMs, true)) {
        changed = true;
        continue;
      }
      if (!found && entry.code === targetCode && entry.accountId === resolvedAccountId) {
        found = true;
        changed = true;
        continue;
      }
      nextCodes.push(persistPairCodeEntry(entry));
    }

    if ((found || changed) && (exists || nextCodes.length > 0)) {
      await writeJsonFileAtomically(filePath, {
        version: 1,
        codes: nextCodes,
      } satisfies GewePairCodeStore);
    }
    return found;
  });

  if (!matched) {
    return null;
  }

  await addAllowFromEntry({
    accountId: resolvedAccountId,
    entry: params.id,
    env: params.env,
  });
  return {
    id: params.id,
    code: targetCode,
    source: "pair-codes",
  };
}

async function redeemFromLegacyPairingStore(params: {
  accountId?: string;
  code: string;
  id: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ id: string; code: string; source: "legacy-pairing" } | null> {
  const resolvedAccountId = normalizeStoreAccountId(params.accountId);
  const targetCode = normalizePairCode(params.code);
  const filePath = resolveGeweLegacyPairingPath(params.env);

  const matched = await withFileLock(filePath, async () => {
    const { value, exists } = await readJsonFileWithFallback<LegacyPairingStore>(filePath, {
      version: 1,
      requests: [],
    });
    const nowMs = Date.now();
    const requests = Array.isArray(value.requests) ? value.requests : [];
    let found = false;
    let changed = false;
    const nextRequests: LegacyPairingRequest[] = [];
    for (const raw of requests) {
      const entry = canonicalizeLegacyPairingRequest(raw);
      if (!entry) {
        changed = true;
        continue;
      }
      if (isExpired(entry.createdAt, nowMs, false)) {
        changed = true;
        continue;
      }
      if (!found && entry.code === targetCode && entry.accountId === resolvedAccountId) {
        found = true;
        changed = true;
        continue;
      }
      nextRequests.push(entry.persisted);
    }

    if ((found || changed) && (exists || nextRequests.length > 0)) {
      await writeJsonFileAtomically(filePath, {
        version: 1,
        requests: nextRequests,
      } satisfies LegacyPairingStore);
    }
    return found;
  });

  if (!matched) {
    return null;
  }

  await addAllowFromEntry({
    accountId: resolvedAccountId,
    entry: params.id,
    env: params.env,
  });
  return {
    id: params.id,
    code: targetCode,
    source: "legacy-pairing",
  };
}

export function resolveGeweAllowFromPath(
  accountId?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(
    resolveCredentialsDir(env),
    `${safeChannelKey(CHANNEL_ID)}-${safeAccountKey(normalizeStoreAccountId(accountId))}-allowFrom.json`,
  );
}

export function resolveGeweLegacyAllowFromPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveCredentialsDir(env), `${safeChannelKey(CHANNEL_ID)}-allowFrom.json`);
}

export function resolveGewePairCodesPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveCredentialsDir(env), `${safeChannelKey(CHANNEL_ID)}-pair-codes.json`);
}

export function resolveGeweLegacyPairingPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveCredentialsDir(env), `${safeChannelKey(CHANNEL_ID)}-pairing.json`);
}

export async function readGeweAllowFromStore(params: {
  accountId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<string[]> {
  const resolvedAccountId = normalizeStoreAccountId(params.accountId);
  const scoped = await readAllowFromFile(resolveGeweAllowFromPath(resolvedAccountId, params.env));
  if (resolvedAccountId !== DEFAULT_ACCOUNT_ID) {
    return scoped;
  }
  const legacy = await readAllowFromFile(resolveGeweLegacyAllowFromPath(params.env));
  return dedupeEntries([...scoped, ...legacy]);
}

export async function redeemGewePairCode(params: {
  accountId?: string;
  code: string;
  id: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ id: string; code: string; source: "pair-codes" | "legacy-pairing" } | null> {
  return (
    (await redeemFromPairCodesStore(params)) ??
    (await redeemFromLegacyPairingStore(params))
  );
}

import { readFileSync } from "node:fs";

import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";

import { CHANNEL_CONFIG_KEY } from "./constants.js";
import type { CoreConfig, GeweAccountConfig, GeweAppIdSource, GeweTokenSource } from "./types.js";

const DEFAULT_API_BASE_URL = "https://www.geweapi.com";

export type ResolvedGeweAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  token: string;
  tokenSource: GeweTokenSource;
  appId: string;
  appIdSource: GeweAppIdSource;
  config: GeweAccountConfig;
};

function listConfiguredAccountIds(cfg: CoreConfig): string[] {
  const accounts = cfg.channels?.[CHANNEL_CONFIG_KEY]?.accounts;
  if (!accounts || typeof accounts !== "object") return [];
  const ids = new Set<string>();
  for (const key of Object.keys(accounts)) {
    if (!key) continue;
    ids.add(normalizeAccountId(key));
  }
  return [...ids];
}

export function listGeweAccountIds(cfg: CoreConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) return [DEFAULT_ACCOUNT_ID];
  return ids.sort((a, b) => a.localeCompare(b));
}

export function resolveDefaultGeweAccountId(cfg: CoreConfig): string {
  const ids = listGeweAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(cfg: CoreConfig, accountId: string): GeweAccountConfig | undefined {
  const accounts = cfg.channels?.[CHANNEL_CONFIG_KEY]?.accounts;
  if (!accounts || typeof accounts !== "object") return undefined;
  const direct = accounts[accountId] as GeweAccountConfig | undefined;
  if (direct) return direct;
  const normalized = normalizeAccountId(accountId);
  const matchKey = Object.keys(accounts).find((key) => normalizeAccountId(key) === normalized);
  return matchKey ? (accounts[matchKey] as GeweAccountConfig | undefined) : undefined;
}

function mergeGeweAccountConfig(cfg: CoreConfig, accountId: string): GeweAccountConfig {
  const { accounts: _ignored, ...base } = (cfg.channels?.[CHANNEL_CONFIG_KEY] ?? {}) as GeweAccountConfig & {
    accounts?: unknown;
  };
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

function resolveToken(
  cfg: CoreConfig,
  accountId: string,
): { token: string; source: GeweTokenSource } {
  const merged = mergeGeweAccountConfig(cfg, accountId);

  const envToken = process.env.GEWE_TOKEN?.trim();
  if (envToken && accountId === DEFAULT_ACCOUNT_ID) {
    return { token: envToken, source: "env" };
  }

  if (merged.tokenFile) {
    try {
      const fileToken = readFileSync(merged.tokenFile, "utf8").trim();
      if (fileToken) return { token: fileToken, source: "configFile" };
    } catch {
      // ignore read failures
    }
  }

  if (merged.token?.trim()) {
    return { token: merged.token.trim(), source: "config" };
  }

  return { token: "", source: "none" };
}

function resolveAppId(
  cfg: CoreConfig,
  accountId: string,
): { appId: string; source: GeweAppIdSource } {
  const merged = mergeGeweAccountConfig(cfg, accountId);

  const envAppId = process.env.GEWE_APP_ID?.trim();
  if (envAppId && accountId === DEFAULT_ACCOUNT_ID) {
    return { appId: envAppId, source: "env" };
  }

  if (merged.appIdFile) {
    try {
      const fileAppId = readFileSync(merged.appIdFile, "utf8").trim();
      if (fileAppId) return { appId: fileAppId, source: "configFile" };
    } catch {
      // ignore read failures
    }
  }

  if (merged.appId?.trim()) {
    return { appId: merged.appId.trim(), source: "config" };
  }

  return { appId: "", source: "none" };
}

export function resolveGeweAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedGeweAccount {
  const hasExplicitAccountId = Boolean(params.accountId?.trim());
  const baseEnabled = params.cfg.channels?.[CHANNEL_CONFIG_KEY]?.enabled !== false;

  const resolve = (accountId: string): ResolvedGeweAccount => {
    const merged = mergeGeweAccountConfig(params.cfg, accountId);
    const accountEnabled = merged.enabled !== false;
    const enabled = baseEnabled && accountEnabled;
    const tokenResolution = resolveToken(params.cfg, accountId);
    const appIdResolution = resolveAppId(params.cfg, accountId);

    if (!merged.apiBaseUrl) {
      merged.apiBaseUrl = DEFAULT_API_BASE_URL;
    } else {
      merged.apiBaseUrl = merged.apiBaseUrl.trim().replace(/\/$/, "");
    }

    return {
      accountId,
      enabled,
      name: merged.name?.trim() || undefined,
      token: tokenResolution.token,
      tokenSource: tokenResolution.source,
      appId: appIdResolution.appId,
      appIdSource: appIdResolution.source,
      config: merged,
    };
  };

  const normalized = normalizeAccountId(params.accountId);
  const primary = resolve(normalized);
  if (hasExplicitAccountId) return primary;
  if (primary.tokenSource !== "none" && primary.appIdSource !== "none") return primary;

  const fallbackId = resolveDefaultGeweAccountId(params.cfg);
  if (fallbackId === primary.accountId) return primary;
  const fallback = resolve(fallbackId);
  if (fallback.tokenSource === "none" || fallback.appIdSource === "none") return primary;
  return fallback;
}

export function listEnabledGeweAccounts(cfg: CoreConfig): ResolvedGeweAccount[] {
  return listGeweAccountIds(cfg)
    .map((accountId) => resolveGeweAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}

import { readFileSync } from "node:fs";

import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";

import { CHANNEL_CONFIG_KEY } from "./constants.js";
import type {
  CoreConfig,
  GeweAccountConfig,
  GeweAppIdSource,
  GeweTokenSource,
  ResolvedGeweAccount,
} from "./types.js";

const DEFAULT_API_BASE_URL = "https://www.geweapi.com";

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

function normalizeUrl(url?: string): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/$/, "");
}

function isGatewayModeConfig(config?: Pick<GeweAccountConfig, "gatewayUrl" | "gatewayKey">): boolean {
  return Boolean(normalizeUrl(config?.gatewayUrl) && config?.gatewayKey?.trim());
}

function resolveToken(
  cfg: CoreConfig,
  accountId: string,
): { token: string; source: GeweTokenSource } {
  const merged = mergeGeweAccountConfig(cfg, accountId);
  if (isGatewayModeConfig(merged)) {
    return { token: "", source: "none" };
  }

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
  if (isGatewayModeConfig(merged)) {
    return { appId: "", source: "none" };
  }

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
    const mode = isGatewayModeConfig(merged) ? "gateway" : "direct";
    const tokenResolution = resolveToken(params.cfg, accountId);
    const appIdResolution = resolveAppId(params.cfg, accountId);

    merged.apiBaseUrl = normalizeUrl(merged.apiBaseUrl) ?? DEFAULT_API_BASE_URL;
    merged.gatewayUrl = normalizeUrl(merged.gatewayUrl);

    return {
      accountId,
      enabled,
      name: merged.name?.trim() || undefined,
      mode,
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

export function resolveIsGatewayMode(
  account: ResolvedGeweAccount | GeweAccountConfig | null | undefined,
): boolean {
  if (!account) return false;
  if ("mode" in account && account.mode) {
    return account.mode === "gateway";
  }
  if ("config" in account && account.config) {
    return isGatewayModeConfig(account.config);
  }
  return isGatewayModeConfig(account);
}

export function resolveIsGeweAccountConfigured(account: ResolvedGeweAccount): boolean {
  if (resolveIsGatewayMode(account)) {
    return Boolean(
      account.config.gatewayUrl?.trim() &&
        account.config.gatewayKey?.trim() &&
        account.config.gatewayInstanceId?.trim() &&
        resolveGatewayCallbackUrl(account) &&
        resolveGatewayGroupBindings(account).length > 0,
    );
  }
  return Boolean(account.token?.trim() && account.appId?.trim());
}

export function resolveGeweTransportBaseUrl(account: ResolvedGeweAccount): string {
  if (resolveIsGatewayMode(account)) {
    return normalizeUrl(account.config.gatewayUrl) ?? DEFAULT_API_BASE_URL;
  }
  return normalizeUrl(account.config.apiBaseUrl) ?? DEFAULT_API_BASE_URL;
}

export function resolveGatewayGroupBindings(account: ResolvedGeweAccount): string[] {
  const groups = account.config.groups;
  if (!groups || typeof groups !== "object") return [];
  return Object.keys(groups).filter((groupId) => {
    const trimmed = groupId.trim();
    if (!trimmed || trimmed === "*") return false;
    const groupConfig = groups[groupId];
    return groupConfig?.enabled !== false;
  });
}

export function resolveGatewayCallbackUrl(account: ResolvedGeweAccount): string | undefined {
  return account.config.webhookPublicUrl?.trim() || undefined;
}

export function resolveGatewayRegisterIntervalMs(account: ResolvedGeweAccount): number {
  const seconds = account.config.gatewayRegisterIntervalSec;
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return Math.round(seconds * 1000);
  }
  return 60_000;
}

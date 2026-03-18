import { CHANNEL_CONFIG_KEY } from "./constants.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId, type OpenClawConfig } from "./openclaw-compat.js";

type ConfigWriteTarget =
  | { kind: "channel"; scope: { channelId: string } }
  | { kind: "account"; scope: { channelId: string; accountId: string } };

type GeweWriteSection = {
  nextCfg: OpenClawConfig;
  channelSection: Record<string, unknown>;
  target: Record<string, unknown>;
  pathPrefix: string;
  writeTarget: ConfigWriteTarget;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function cloneOpenClawConfig<T>(value: T): T {
  return structuredClone(value);
}

function ensureGeweWriteSectionOnConfig(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): GeweWriteSection {
  const nextCfg = params.cfg;
  const channels = ((nextCfg.channels ??= {}) as Record<string, unknown>);
  const channelSection = ((asRecord(channels[CHANNEL_CONFIG_KEY]) ?? {}) as Record<string, unknown>);
  channels[CHANNEL_CONFIG_KEY] = channelSection;

  const normalizedAccountId = normalizeAccountId(params.accountId);
  const hasAccounts =
    channelSection.accounts && typeof channelSection.accounts === "object" && !Array.isArray(channelSection.accounts);
  const useAccount = normalizedAccountId !== DEFAULT_ACCOUNT_ID || Boolean(hasAccounts);
  if (!useAccount) {
    return {
      nextCfg,
      channelSection,
      target: channelSection,
      pathPrefix: `channels.${CHANNEL_CONFIG_KEY}`,
      writeTarget: {
        kind: "channel",
        scope: { channelId: CHANNEL_CONFIG_KEY },
      },
    };
  }

  const accounts = ((asRecord(channelSection.accounts) ?? {}) as Record<string, unknown>);
  channelSection.accounts = accounts;
  const accountSection = ((asRecord(accounts[normalizedAccountId]) ?? {}) as Record<string, unknown>);
  accounts[normalizedAccountId] = accountSection;
  return {
    nextCfg,
    channelSection,
    target: accountSection,
    pathPrefix: `channels.${CHANNEL_CONFIG_KEY}.accounts.${normalizedAccountId}`,
    writeTarget: {
      kind: "account",
      scope: {
        channelId: CHANNEL_CONFIG_KEY,
        accountId: normalizedAccountId,
      },
    },
  };
}

export function ensureGeweWriteSection(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}) {
  return ensureGeweWriteSectionOnConfig({
    cfg: cloneOpenClawConfig(params.cfg),
    accountId: params.accountId,
  });
}

export function ensureGeweWriteSectionInPlace(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}) {
  return ensureGeweWriteSectionOnConfig(params);
}

export function cleanupEmptyObject(parent: Record<string, unknown>, key: string) {
  const value = asRecord(parent[key]);
  if (value && Object.keys(value).length === 0) {
    delete parent[key];
  }
}

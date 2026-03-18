import type { ChannelStatusAdapter, ChannelStatusIssue } from "openclaw/plugin-sdk/channel-runtime";

import type { ResolvedGeweAccount } from "./accounts.js";
import { collectKnownGeweGroupEntries, collectKnownGewePeerEntries } from "./channel-directory.js";
import { getGeweDirectoryCacheCounts } from "./directory-cache.js";
import { CHANNEL_CONFIG_KEY } from "./constants.js";
import { getGeweProfile } from "./group-binding.js";
import { normalizeGeweBindingConversationId } from "./group-binding.js";
import { normalizeAccountId, type OpenClawConfig } from "./openclaw-compat.js";
import { readGeweAllowFromStore } from "./pairing-store.js";

type GeweStatusProbe = {
  ok: boolean;
  latencyMs?: number;
  self?: {
    wxid: string;
    nickName?: string;
  };
  error?: string;
};

type BindingLike = {
  match?: {
    channel?: string;
    accountId?: string;
    peer?: {
      kind?: string;
      id?: string;
    };
  };
};

const CHANNEL_ALIASES = new Set(["gewe-openclaw", "gewe", "wechat", "wx"]);

function listConfigBindings(cfg: OpenClawConfig): BindingLike[] {
  return Array.isArray(cfg.bindings) ? (cfg.bindings as BindingLike[]) : [];
}

function normalizeBindingChannel(value?: string): string {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return CHANNEL_ALIASES.has(trimmed) ? CHANNEL_CONFIG_KEY : trimmed;
}

function bindingMatchesAccount(bindingAccountId: string | undefined, accountId: string): boolean {
  const trimmed = bindingAccountId?.trim();
  if (!trimmed) {
    return accountId === "default";
  }
  if (trimmed === "*") {
    return true;
  }
  return normalizeAccountId(trimmed) === accountId;
}

function countExplicitBindings(cfg: OpenClawConfig, accountId: string): number {
  let count = 0;
  for (const binding of listConfigBindings(cfg)) {
    if (normalizeBindingChannel(binding.match?.channel) !== CHANNEL_CONFIG_KEY) {
      continue;
    }
    if (!bindingMatchesAccount(binding.match?.accountId, accountId)) {
      continue;
    }
    const normalizedId = normalizeGeweBindingConversationId(binding.match?.peer?.id);
    if (!normalizedId) {
      continue;
    }
    count += 1;
  }
  return count;
}

function countGroupOverrides(account: ResolvedGeweAccount): number {
  return Object.entries(account.config.groups ?? {}).filter(
    ([, group]) => Array.isArray(group?.allowFrom) && group.allowFrom.length > 0,
  ).length;
}

export const geweStatus: ChannelStatusAdapter<ResolvedGeweAccount, GeweStatusProbe> = {
  probeAccount: async ({ account }) => {
    const startedAt = Date.now();
    try {
      const profile = await getGeweProfile({ account });
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        self: {
          wxid: profile.wxid,
          nickName: profile.nickName,
        },
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: String(err),
      };
    }
  },
  buildChannelSummary: async ({ snapshot }) => ({
    configured: snapshot.configured ?? false,
    tokenSource: snapshot.tokenSource ?? "none",
    running: snapshot.running ?? false,
    mode: snapshot.mode ?? null,
    lastStartAt: snapshot.lastStartAt ?? null,
    lastStopAt: snapshot.lastStopAt ?? null,
    lastError: snapshot.lastError ?? null,
    lastInboundAt: snapshot.lastInboundAt ?? null,
    lastOutboundAt: snapshot.lastOutboundAt ?? null,
    apiReachable: snapshot.apiReachable ?? false,
    apiLatencyMs: snapshot.apiLatencyMs ?? null,
    self: snapshot.self ?? null,
    knownPeersCount: snapshot.knownPeersCount ?? 0,
    knownGroupsCount: snapshot.knownGroupsCount ?? 0,
    cachedGroupMemberCount: snapshot.cachedGroupMemberCount ?? 0,
    explicitBindingCount: snapshot.explicitBindingCount ?? 0,
    groupOverrideCount: snapshot.groupOverrideCount ?? 0,
    pairingAllowFromCount: snapshot.pairingAllowFromCount ?? 0,
  }),
  buildAccountSnapshot: async ({ account, runtime, cfg, probe }) => {
    const configured = Boolean(account.token?.trim() && account.appId?.trim());
    const pairingEntries = await readGeweAllowFromStore({
      accountId: account.accountId,
    }).catch(() => []);
    const peerEntries = collectKnownGewePeerEntries({
      cfg,
      accountId: account.accountId,
    });
    const groupEntries = collectKnownGeweGroupEntries({
      cfg,
      accountId: account.accountId,
    });
    const cacheCounts = getGeweDirectoryCacheCounts(account.accountId);
    return {
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured,
      tokenSource: account.tokenSource,
      baseUrl: account.config.apiBaseUrl ? "[set]" : "[missing]",
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      mode: "webhook",
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
      dmPolicy: account.config.dmPolicy ?? "pairing",
      groupPolicy: account.config.groupPolicy ?? "allowlist",
      apiReachable: probe?.ok ?? false,
      apiLatencyMs: probe?.latencyMs ?? null,
      self: probe?.self ?? null,
      knownPeersCount: peerEntries.length,
      knownGroupsCount: groupEntries.length,
      cachedGroupMemberCount: cacheCounts.cachedGroupMemberCount,
      explicitBindingCount: countExplicitBindings(cfg, account.accountId),
      groupOverrideCount: countGroupOverrides(account),
      pairingAllowFromCount: pairingEntries.length,
    };
  },
  collectStatusIssues: (accounts) => {
    const issues: ChannelStatusIssue[] = [];
    for (const account of accounts) {
      if (account.configured && account.apiReachable === false) {
        issues.push({
          channel: CHANNEL_CONFIG_KEY,
          accountId: account.accountId,
          kind: "runtime",
          message: `GeWe API probe failed for account "${account.accountId}".`,
          fix: "Check token/appId, API base URL, and GeWe service availability.",
        });
      }
      if (account.groupPolicy === "open" && (account.groupOverrideCount ?? 0) === 0) {
        issues.push({
          channel: CHANNEL_CONFIG_KEY,
          accountId: account.accountId,
          kind: "config",
          message:
            'GeWe groupPolicy="open" is active without any per-group allowFrom override.',
          fix: `Set channels.${CHANNEL_CONFIG_KEY}.groupAllowFrom or groups.<room>.allowFrom to narrow group access.`,
        });
      }
    }
    return issues;
  },
};

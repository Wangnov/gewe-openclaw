import type { ChannelAllowlistAdapter } from "openclaw/plugin-sdk/channel-runtime";

import { resolveGeweAccount } from "./accounts.js";
import { collectKnownGeweGroupEntries } from "./channel-directory.js";
import { cleanupEmptyObject, ensureGeweWriteSectionInPlace } from "./config-edit.js";
import { CHANNEL_CONFIG_KEY, stripChannelPrefix } from "./constants.js";
import { normalizeGeweMessagingTarget } from "./normalize.js";
import { normalizeAccountId, type OpenClawConfig } from "./openclaw-compat.js";
import type { CoreConfig } from "./types.js";
import { resolveCachedGeweName } from "./directory-cache.js";

function normalizeAllowEntry(raw: unknown): string | null {
  const stripped = stripChannelPrefix(String(raw ?? "").trim());
  if (!stripped || stripped === "*") {
    return stripped === "*" ? "*" : null;
  }
  return normalizeGeweMessagingTarget(stripped) ?? stripped;
}

function dedupeEntries(values: Array<string | number>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeAllowEntry(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function resolveOverridesLabel(params: {
  accountId: string;
  groupId: string;
  cfg: OpenClawConfig;
}): string {
  if (params.groupId === "*") {
    return "*";
  }
  return (
    resolveCachedGeweName({
      accountId: params.accountId,
      id: params.groupId,
      kind: "group",
    }) ?? params.groupId
  );
}

function getWritableList(target: Record<string, unknown>, key: string): string[] {
  return Array.isArray(target[key])
    ? (target[key] as unknown[]).map((entry) => String(entry)).filter(Boolean)
    : [];
}

export const geweAllowlist: ChannelAllowlistAdapter = {
  supportsScope: ({ scope }) => scope === "dm" || scope === "group" || scope === "all",
  readConfig: ({ cfg, accountId }) => {
    const account = resolveGeweAccount({
      cfg: cfg as CoreConfig,
      accountId,
    });
    const groupOverrides = Object.entries(account.config.groups ?? {})
      .filter(([, value]) => Array.isArray(value?.allowFrom) && value.allowFrom.length > 0)
      .map(([groupId, value]) => ({
        label: resolveOverridesLabel({
          accountId: account.accountId,
          groupId,
          cfg,
        }),
        entries: dedupeEntries((value?.allowFrom ?? []) as Array<string | number>),
      }));
    return {
      dmAllowFrom: dedupeEntries(account.config.allowFrom ?? []),
      groupAllowFrom: dedupeEntries(account.config.groupAllowFrom ?? []),
      dmPolicy: account.config.dmPolicy,
      groupPolicy: account.config.groupPolicy,
      ...(groupOverrides.length > 0 ? { groupOverrides } : {}),
    };
  },
  resolveNames: ({ cfg, accountId, scope, entries }) => {
    const resolvedAccountId = resolveGeweAccount({
      cfg: cfg as CoreConfig,
      accountId,
    }).accountId;
    return entries.map((entry) => {
      const normalized = normalizeAllowEntry(entry);
      if (!normalized) {
        return { input: entry, resolved: false, name: null };
      }
      const name =
        scope === "group"
          ? collectKnownGeweGroupEntries({ cfg, accountId: resolvedAccountId }).find(
              (group) => group.id === normalized,
            )?.name
          : resolveCachedGeweName({
              accountId: resolvedAccountId,
              id: normalized,
              kind: "user",
            });
      return {
        input: entry,
        resolved: Boolean(name),
        name: name ?? null,
      };
    });
  },
  applyConfigEdit: ({ cfg, parsedConfig, accountId, scope, action, entry }) => {
    const normalizedEntry = normalizeAllowEntry(entry);
    if (!normalizedEntry) {
      return { kind: "invalid-entry" };
    }
    const write = ensureGeweWriteSectionInPlace({
      cfg: parsedConfig as OpenClawConfig,
      accountId,
    });
    const key = scope === "dm" ? "allowFrom" : "groupAllowFrom";
    const existing = dedupeEntries(getWritableList(write.target, key));
    const nextSet = new Set(existing);
    const hadEntry = nextSet.has(normalizedEntry);
    if (action === "add") {
      nextSet.add(normalizedEntry);
    } else {
      nextSet.delete(normalizedEntry);
    }
    const next = Array.from(nextSet);
    const changed = action === "add" ? !hadEntry : hadEntry;
    if (changed) {
      if (next.length > 0) {
        write.target[key] = next;
      } else {
        delete write.target[key];
      }
      if (write.writeTarget.kind === "account") {
        const channels = write.nextCfg.channels as Record<string, unknown>;
        const channel = channels[CHANNEL_CONFIG_KEY] as Record<string, unknown>;
        const accounts = channel.accounts as Record<string, unknown>;
        cleanupEmptyObject(accounts, normalizeAccountId(accountId));
        cleanupEmptyObject(channel, "accounts");
      }
    }
    return {
      kind: "ok" as const,
      changed,
      pathLabel: `${write.pathPrefix}.${key}`,
      writeTarget: write.writeTarget,
    };
  },
};

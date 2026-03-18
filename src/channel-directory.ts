import type { ChannelDirectoryAdapter, ChannelDirectoryEntry } from "openclaw/plugin-sdk/channel-runtime";

import { resolveGeweAccount } from "./accounts.js";
import {
  getGeweChatroomInfo,
  getGeweProfile,
  normalizeGeweBindingConversationId,
} from "./group-binding.js";
import { normalizeGeweMessagingTarget } from "./normalize.js";
import { normalizeAccountId, type OpenClawConfig } from "./openclaw-compat.js";
import type { CoreConfig } from "./types.js";
import {
  listCachedGeweGroups,
  listCachedGeweUsers,
  rememberGeweDirectoryObservation,
  rememberGeweGroupMembers,
  resolveCachedGeweName,
} from "./directory-cache.js";

type DirectoryNamedEntry = {
  id: string;
  name?: string;
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

function addNamedEntry(target: Map<string, DirectoryNamedEntry>, entry: DirectoryNamedEntry) {
  if (!entry.id || target.has(entry.id)) {
    return;
  }
  target.set(entry.id, entry);
}

function normalizeQuery(value?: string | null): string {
  return value?.trim().toLowerCase() || "";
}

function matchesQuery(entry: DirectoryNamedEntry, query: string): boolean {
  if (!query) {
    return true;
  }
  return entry.id.toLowerCase().includes(query) || entry.name?.toLowerCase().includes(query) === true;
}

function applyQueryAndLimit(
  entries: DirectoryNamedEntry[],
  params: { query?: string | null; limit?: number | null },
): DirectoryNamedEntry[] {
  const query = normalizeQuery(params.query);
  const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : undefined;
  const filtered = entries.filter((entry) => matchesQuery(entry, query));
  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
}

function toDirectoryEntries(
  kind: "user" | "group",
  entries: DirectoryNamedEntry[],
): ChannelDirectoryEntry[] {
  return entries.map((entry) => ({
    kind,
    id: entry.id,
    name: entry.name,
  }));
}

function isGroupId(value: string): boolean {
  return /@chatroom$/i.test(value);
}

function listConfigBindings(cfg: OpenClawConfig): BindingLike[] {
  return Array.isArray(cfg.bindings) ? (cfg.bindings as BindingLike[]) : [];
}

function normalizeBindingChannel(value?: string): string {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return CHANNEL_ALIASES.has(trimmed) ? "gewe-openclaw" : trimmed;
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

function collectKnownPeerEntries(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): DirectoryNamedEntry[] {
  const account = resolveGeweAccount({
    cfg: params.cfg as CoreConfig,
    accountId: params.accountId,
  });
  const entries = new Map<string, DirectoryNamedEntry>();
  const pushUserId = (raw: unknown) => {
    const normalized = normalizeGeweMessagingTarget(String(raw ?? ""));
    if (!normalized || normalized === "*" || isGroupId(normalized)) {
      return;
    }
    addNamedEntry(entries, {
      id: normalized,
      name: resolveCachedGeweName({
        accountId: account.accountId,
        id: normalized,
        kind: "user",
      }),
    });
  };

  for (const entry of account.config.allowFrom ?? []) {
    pushUserId(entry);
  }
  for (const id of Object.keys(account.config.dms ?? {})) {
    pushUserId(id);
  }
  for (const entry of account.config.groupAllowFrom ?? []) {
    pushUserId(entry);
  }
  for (const cached of listCachedGeweUsers(account.accountId)) {
    addNamedEntry(entries, {
      id: cached.id,
      name: cached.name,
    });
  }
  return Array.from(entries.values());
}

function collectKnownGroupEntries(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): DirectoryNamedEntry[] {
  const account = resolveGeweAccount({
    cfg: params.cfg as CoreConfig,
    accountId: params.accountId,
  });
  const entries = new Map<string, DirectoryNamedEntry>();

  for (const binding of listConfigBindings(params.cfg)) {
    if (normalizeBindingChannel(binding.match?.channel) !== "gewe-openclaw") {
      continue;
    }
    if (!bindingMatchesAccount(binding.match?.accountId, account.accountId)) {
      continue;
    }
    if (binding.match?.peer?.kind?.trim().toLowerCase() !== "group") {
      continue;
    }
    const groupId = normalizeGeweBindingConversationId(binding.match.peer.id);
    if (!groupId || groupId === "*") {
      continue;
    }
    addNamedEntry(entries, {
      id: groupId,
      name: resolveCachedGeweName({
        accountId: account.accountId,
        id: groupId,
        kind: "group",
      }),
    });
  }

  for (const groupId of Object.keys(account.config.groups ?? {})) {
    if (groupId === "*") {
      continue;
    }
    const normalized = normalizeGeweBindingConversationId(groupId);
    if (!normalized) {
      continue;
    }
    addNamedEntry(entries, {
      id: normalized,
      name: resolveCachedGeweName({
        accountId: account.accountId,
        id: normalized,
        kind: "group",
      }),
    });
  }

  for (const cached of listCachedGeweGroups(account.accountId)) {
    addNamedEntry(entries, {
      id: cached.id,
      name: cached.name,
    });
  }
  return Array.from(entries.values());
}

export function collectKnownGewePeerEntries(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}) {
  return collectKnownPeerEntries(params);
}

export function collectKnownGeweGroupEntries(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}) {
  return collectKnownGroupEntries(params);
}

export const geweDirectory: ChannelDirectoryAdapter = {
  self: async ({ cfg, accountId }) => {
    const account = resolveGeweAccount({
      cfg: cfg as CoreConfig,
      accountId,
    });
    const profile = await getGeweProfile({ account });
    return {
      kind: "user",
      id: profile.wxid,
      name: profile.nickName,
      raw: profile,
    };
  },
  listPeers: async ({ cfg, accountId, query, limit }) =>
    toDirectoryEntries(
      "user",
      applyQueryAndLimit(collectKnownPeerEntries({ cfg, accountId }), { query, limit }),
    ),
  listGroups: async ({ cfg, accountId, query, limit }) =>
    toDirectoryEntries(
      "group",
      applyQueryAndLimit(collectKnownGroupEntries({ cfg, accountId }), { query, limit }),
    ),
  listGroupMembers: async ({ cfg, accountId, groupId, limit }) => {
    const account = resolveGeweAccount({
      cfg: cfg as CoreConfig,
      accountId,
    });
    const groupInfo = await getGeweChatroomInfo({
      account,
      groupId,
    });
    const members = groupInfo.memberList?.map((member) => ({
      id: member.wxid?.trim(),
      name: member.displayName?.trim() || member.nickName?.trim() || undefined,
    })) ?? [];
    rememberGeweDirectoryObservation({
      accountId: account.accountId,
      groupId: groupInfo.chatroomId,
      groupName: groupInfo.nickName,
    });
    rememberGeweGroupMembers({
      accountId: account.accountId,
      groupId: groupInfo.chatroomId,
      groupName: groupInfo.nickName,
      members,
    });
    return toDirectoryEntries(
      "user",
      applyQueryAndLimit(
        members
          .filter((member): member is DirectoryNamedEntry => Boolean(member.id))
          .map((member) => ({
            id: member.id!,
            name: member.name,
          })),
        { limit },
      ),
    );
  },
};

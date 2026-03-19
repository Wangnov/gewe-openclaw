import type { ChannelDirectoryAdapter, ChannelDirectoryEntry } from "openclaw/plugin-sdk/channel-runtime";

import { resolveGeweAccount } from "./accounts.js";
import {
  fetchContactsListCacheGewe,
  fetchContactsListGewe,
  getBriefInfoGewe,
  type GeweContactProfile,
  type GeweContactsCatalog,
} from "./contacts-api.js";
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
  rememberGeweUsers,
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
const BRIEF_INFO_BATCH_SIZE = 100;

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

function chunkEntries<T>(values: T[], size: number): T[][] {
  if (values.length === 0) {
    return [];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function isGroupId(value: string): boolean {
  return /@chatroom$/i.test(value);
}

function dedupeIds(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeGeweMessagingTarget(value ?? "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function resolveCatalogFriendIds(catalog: GeweContactsCatalog | undefined): string[] {
  return dedupeIds(catalog?.friends ?? []);
}

function resolveContactProfileId(profile: GeweContactProfile): string | undefined {
  const normalized = normalizeGeweMessagingTarget(
    String(profile.userName ?? profile.wxid ?? "").trim(),
  );
  if (!normalized || isGroupId(normalized)) {
    return undefined;
  }
  return normalized;
}

function resolveContactDisplayName(profile: GeweContactProfile): string | undefined {
  const candidates = [profile.remark, profile.nickName, profile.alias];
  for (const candidate of candidates) {
    const trimmed = typeof candidate === "string" ? candidate.trim() : "";
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
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

async function enrichPeerEntriesFromContacts(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  entries: DirectoryNamedEntry[];
}): Promise<DirectoryNamedEntry[]> {
  const account = resolveGeweAccount({
    cfg: params.cfg as CoreConfig,
    accountId: params.accountId,
  });
  const entries = new Map<string, DirectoryNamedEntry>();
  for (const entry of params.entries) {
    addNamedEntry(entries, entry);
  }

  try {
    const cachedCatalog = await fetchContactsListCacheGewe({ account });
    let friendIds = resolveCatalogFriendIds(cachedCatalog);
    if (friendIds.length === 0) {
      friendIds = resolveCatalogFriendIds(await fetchContactsListGewe({ account }));
    }

    for (const friendId of friendIds) {
      addNamedEntry(entries, {
        id: friendId,
        name: resolveCachedGeweName({
          accountId: account.accountId,
          id: friendId,
          kind: "user",
        }),
      });
    }

    const missingIds = Array.from(entries.values())
      .filter((entry) => !entry.name && !isGroupId(entry.id))
      .map((entry) => entry.id);
    if (missingIds.length === 0) {
      return Array.from(entries.values());
    }

    const rememberedUsers: Array<{ id: string; name?: string }> = [];
    for (const batch of chunkEntries(missingIds, BRIEF_INFO_BATCH_SIZE)) {
      const profiles = (await getBriefInfoGewe({ account, wxids: batch })) ?? [];
      for (const profile of profiles) {
        const id = resolveContactProfileId(profile);
        if (!id) {
          continue;
        }
        const name = resolveContactDisplayName(profile);
        rememberedUsers.push({ id, name });
        const existing = entries.get(id);
        if (existing) {
          entries.set(id, {
            ...existing,
            name: name ?? existing.name,
          });
          continue;
        }
        addNamedEntry(entries, { id, name });
      }
    }

    if (rememberedUsers.length > 0) {
      rememberGeweUsers({
        accountId: account.accountId,
        users: rememberedUsers,
      });
    }
  } catch {
    // 目录 enrich 走尽力而为策略，避免因为通讯录 API 波动导致目录不可用。
  }

  return Array.from(entries.values());
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
      applyQueryAndLimit(
        await enrichPeerEntriesFromContacts({
          cfg,
          accountId,
          entries: collectKnownPeerEntries({ cfg, accountId }),
        }),
        { query, limit },
      ),
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

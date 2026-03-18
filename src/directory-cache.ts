import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "./openclaw-compat.js";

type NamedEntry = {
  id: string;
  name?: string;
  lastSeenAt: number;
};

type AccountDirectoryCache = {
  users: Map<string, NamedEntry>;
  groups: Map<string, NamedEntry>;
  groupMembers: Map<string, Map<string, NamedEntry>>;
};

const directoryCache = new Map<string, AccountDirectoryCache>();

function resolveAccountCache(accountId?: string | null): AccountDirectoryCache {
  const normalized = normalizeAccountId(accountId ?? DEFAULT_ACCOUNT_ID);
  let existing = directoryCache.get(normalized);
  if (!existing) {
    existing = {
      users: new Map(),
      groups: new Map(),
      groupMembers: new Map(),
    };
    directoryCache.set(normalized, existing);
  }
  return existing;
}

function upsertNamedEntry(
  target: Map<string, NamedEntry>,
  params: { id?: string | null; name?: string | null; lastSeenAt?: number },
) {
  const id = params.id?.trim();
  if (!id) {
    return;
  }
  const current = target.get(id);
  const name = params.name?.trim() || current?.name;
  target.set(id, {
    id,
    name: name || undefined,
    lastSeenAt: params.lastSeenAt ?? Date.now(),
  });
}

export function rememberGeweDirectoryObservation(params: {
  accountId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  timestamp?: number;
}) {
  const cache = resolveAccountCache(params.accountId);
  const lastSeenAt = params.timestamp ?? Date.now();
  upsertNamedEntry(cache.users, {
    id: params.senderId,
    name: params.senderName,
    lastSeenAt,
  });
  upsertNamedEntry(cache.groups, {
    id: params.groupId,
    name: params.groupName,
    lastSeenAt,
  });
}

export function rememberGeweGroupMembers(params: {
  accountId?: string | null;
  groupId: string;
  groupName?: string | null;
  members: Array<{ id?: string | null; name?: string | null }>;
  timestamp?: number;
}) {
  const cache = resolveAccountCache(params.accountId);
  const lastSeenAt = params.timestamp ?? Date.now();
  upsertNamedEntry(cache.groups, {
    id: params.groupId,
    name: params.groupName,
    lastSeenAt,
  });
  const memberMap = new Map<string, NamedEntry>();
  for (const member of params.members) {
    const id = member.id?.trim();
    if (!id) {
      continue;
    }
    const name = member.name?.trim() || undefined;
    memberMap.set(id, {
      id,
      name,
      lastSeenAt,
    });
    upsertNamedEntry(cache.users, {
      id,
      name,
      lastSeenAt,
    });
  }
  cache.groupMembers.set(params.groupId, memberMap);
}

export function listCachedGeweUsers(accountId?: string | null): NamedEntry[] {
  return Array.from(resolveAccountCache(accountId).users.values());
}

export function listCachedGeweGroups(accountId?: string | null): NamedEntry[] {
  return Array.from(resolveAccountCache(accountId).groups.values());
}

export function listCachedGeweGroupMembers(params: {
  accountId?: string | null;
  groupId: string;
}): NamedEntry[] {
  return Array.from(
    resolveAccountCache(params.accountId).groupMembers.get(params.groupId)?.values() ?? [],
  );
}

export function resolveCachedGeweName(params: {
  accountId?: string | null;
  id: string;
  kind: "user" | "group";
}): string | undefined {
  const cache = resolveAccountCache(params.accountId);
  return params.kind === "group"
    ? cache.groups.get(params.id)?.name
    : cache.users.get(params.id)?.name;
}

export function getGeweDirectoryCacheCounts(accountId?: string | null) {
  const cache = resolveAccountCache(accountId);
  const cachedGroupMemberCount = Array.from(cache.groupMembers.values()).reduce(
    (sum, group) => sum + group.size,
    0,
  );
  return {
    cachedUsersCount: cache.users.size,
    cachedGroupsCount: cache.groups.size,
    cachedGroupMemberCount,
  };
}

export function resetGeweDirectoryCacheForTests() {
  directoryCache.clear();
}

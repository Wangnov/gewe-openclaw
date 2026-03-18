import { createHash } from "node:crypto";

import { resolveGeweAccount } from "./accounts.js";
import { assertGeweOk, postGeweJson } from "./api.js";
import { normalizeGeweMessagingTarget } from "./normalize.js";
import { normalizeAccountId, type OpenClawConfig } from "./openclaw-compat.js";
import type {
  CoreConfig,
  GeweAccountConfig,
  GeweBindingIdentityRemarkConfig,
  GeweBindingIdentitySelfConfig,
  GeweGroupBindingIdentityConfig,
  GeweGroupConfig,
  ResolvedGeweAccount,
} from "./types.js";

const GEWE_CHANNEL_ALIASES = new Set(["gewe-openclaw", "gewe", "wechat", "wx"]);

type BindingLike = {
  type?: string;
  agentId?: string;
  match: {
    channel: string;
    accountId?: string;
    peer?: {
      kind?: string;
      id?: string;
    };
  };
};

export type GeweExactGroupBinding = {
  kind: "route" | "acp";
  groupId: string;
  accountId: string;
  agentId: string;
  binding: BindingLike;
};

export type ResolvedGeweGroupBindingIdentity = {
  enabled: boolean;
  selfNickname: Required<Pick<GeweBindingIdentitySelfConfig, "source">> & {
    value?: string;
  };
  remark: Required<Pick<GeweBindingIdentityRemarkConfig, "source">> & {
    value?: string;
  };
};

export type GeweProfile = {
  wxid: string;
  nickName?: string;
};

export type GeweChatroomInfo = {
  chatroomId: string;
  nickName?: string;
  remark?: string | null;
  memberList?: Array<{
    wxid?: string;
    nickName?: string | null;
    displayName?: string | null;
  }>;
};

function normalizeAgentId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "main";
  }
  return (
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "")
      .slice(0, 64) || "main"
  );
}

function normalizeBindingChannel(raw: string | undefined): string {
  const trimmed = raw?.trim().toLowerCase() ?? "";
  return GEWE_CHANNEL_ALIASES.has(trimmed) ? "gewe-openclaw" : trimmed;
}

function normalizeBindingAccountPattern(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "*") {
    return "*";
  }
  return normalizeAccountId(trimmed);
}

function resolveBindingAccountMatchScore(pattern: string, accountId: string): 0 | 1 | 2 {
  if (pattern === "*") {
    return 1;
  }
  if (!pattern) {
    return accountId === "default" ? 2 : 0;
  }
  return pattern === accountId ? 2 : 0;
}

function normalizeBindingConversationId(raw: string | undefined): string | null {
  const normalized = raw ? normalizeGeweMessagingTarget(raw) : null;
  return normalized?.trim() ? normalized : null;
}

function isGroupPeer(binding: BindingLike, groupId: string): boolean {
  return (
    binding.match.peer?.kind?.trim().toLowerCase() === "group" &&
    normalizeBindingConversationId(binding.match.peer.id) === groupId
  );
}

function buildConfiguredAcpSessionKey(params: {
  channel: string;
  accountId: string;
  conversationId: string;
  agentId: string;
}): string {
  const hash = createHash("sha256")
    .update(`${params.channel}:${params.accountId}:${params.conversationId}`)
    .digest("hex")
    .slice(0, 16);
  return `agent:${normalizeAgentId(params.agentId)}:acp:binding:${params.channel}:${params.accountId}:${hash}`;
}

function parseRouteGroupIdFromSessionKey(sessionKey: string | undefined): string | undefined {
  const trimmed = sessionKey?.trim().toLowerCase() ?? "";
  const marker = ":gewe-openclaw:group:";
  const index = trimmed.indexOf(marker);
  if (index === -1) {
    return undefined;
  }
  const groupId = trimmed.slice(index + marker.length).trim();
  return groupId || undefined;
}

function normalizeComparableValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function listConfigBindings(cfg: OpenClawConfig): BindingLike[] {
  return Array.isArray(cfg.bindings) ? (cfg.bindings as BindingLike[]) : [];
}

function pickBetterBinding(
  current: { score: 0 | 1 | 2; binding: BindingLike } | null,
  candidate: { score: 0 | 1 | 2; binding: BindingLike },
) {
  if (!current) {
    return candidate;
  }
  return candidate.score > current.score ? candidate : current;
}

export function normalizeGeweBindingConversationId(raw: string | undefined): string | undefined {
  const normalized = normalizeBindingConversationId(raw);
  return normalized ?? undefined;
}

export function resolveGeweGroupBindingIdentity(params: {
  groupConfig?: GeweGroupConfig;
  wildcardConfig?: GeweGroupConfig;
}): ResolvedGeweGroupBindingIdentity {
  const exact = params.groupConfig?.bindingIdentity;
  const wildcard = params.wildcardConfig?.bindingIdentity;
  return {
    enabled: exact?.enabled ?? wildcard?.enabled ?? true,
    selfNickname: {
      source: exact?.selfNickname?.source ?? wildcard?.selfNickname?.source ?? "agent_name",
      value: exact?.selfNickname?.value ?? wildcard?.selfNickname?.value,
    },
    remark: {
      source: exact?.remark?.source ?? wildcard?.remark?.source ?? "agent_id",
      value: exact?.remark?.value ?? wildcard?.remark?.value,
    },
  };
}

export function resolveExplicitGeweGroupBinding(params: {
  cfg: OpenClawConfig;
  accountId: string;
  groupId: string;
}): GeweExactGroupBinding | null {
  const accountId = normalizeAccountId(params.accountId);
  const groupId = normalizeBindingConversationId(params.groupId);
  if (!groupId) {
    return null;
  }

  let bestRoute: { score: 0 | 1 | 2; binding: BindingLike } | null = null;
  let bestAcp: { score: 0 | 1 | 2; binding: BindingLike } | null = null;

  for (const binding of listConfigBindings(params.cfg)) {
    if (normalizeBindingChannel(binding.match.channel) !== "gewe-openclaw") {
      continue;
    }
    if (!isGroupPeer(binding, groupId)) {
      continue;
    }
    const score = resolveBindingAccountMatchScore(
      normalizeBindingAccountPattern(binding.match.accountId),
      accountId,
    );
    if (score === 0) {
      continue;
    }
    if (binding.type === "acp") {
      bestAcp = pickBetterBinding(bestAcp, { score, binding });
    } else {
      bestRoute = pickBetterBinding(bestRoute, { score, binding });
    }
  }

  if (bestAcp) {
    return {
      kind: "acp",
      groupId,
      accountId,
      agentId: bestAcp.binding.agentId?.trim() || "main",
      binding: bestAcp.binding,
    };
  }
  if (bestRoute) {
    return {
      kind: "route",
      groupId,
      accountId,
      agentId: bestRoute.binding.agentId?.trim() || "main",
      binding: bestRoute.binding,
    };
  }
  return null;
}

export function inferCurrentGeweGroupId(params: {
  cfg: OpenClawConfig;
  accountId: string;
  sessionKey?: string;
}): string | undefined {
  const routeGroupId = parseRouteGroupIdFromSessionKey(params.sessionKey);
  if (routeGroupId) {
    return routeGroupId;
  }
  const normalizedSessionKey = params.sessionKey?.trim().toLowerCase();
  if (!normalizedSessionKey) {
    return undefined;
  }
  const accountId = normalizeAccountId(params.accountId);
  for (const binding of listConfigBindings(params.cfg)) {
    if (binding.type !== "acp" || normalizeBindingChannel(binding.match.channel) !== "gewe-openclaw") {
      continue;
    }
    const groupId = normalizeBindingConversationId(binding.match.peer?.id);
    if (!groupId || binding.match.peer?.kind?.trim().toLowerCase() !== "group") {
      continue;
    }
    const score = resolveBindingAccountMatchScore(
      normalizeBindingAccountPattern(binding.match.accountId),
      accountId,
    );
    if (score === 0) {
      continue;
    }
    const expectedSessionKey = buildConfiguredAcpSessionKey({
      channel: "gewe-openclaw",
      accountId,
      conversationId: groupId,
      agentId: binding.agentId?.trim() || "main",
    });
    if (expectedSessionKey === normalizedSessionKey) {
      return groupId;
    }
  }
  return undefined;
}

export function resolveGeweAgentDisplayName(cfg: OpenClawConfig, agentId: string): string {
  const agents = (cfg.agents as { list?: Array<{ id?: string; name?: string }> } | undefined)?.list ?? [];
  const match = agents.find((agent) => agent.id?.trim() === agentId);
  return match?.name?.trim() || agentId;
}

export function buildGeweDesiredBindingIdentity(params: {
  identity: ResolvedGeweGroupBindingIdentity;
  agentId: string;
  agentName: string;
}): {
  selfNickname: string | null;
  remark: string | null;
} {
  const selfNickname = (() => {
    switch (params.identity.selfNickname.source) {
      case "agent_id":
        return normalizeComparableValue(params.agentId);
      case "literal":
        return normalizeComparableValue(params.identity.selfNickname.value);
      case "agent_name":
      default:
        return normalizeComparableValue(params.agentName);
    }
  })();
  const remark = (() => {
    switch (params.identity.remark.source) {
      case "agent_name":
        return normalizeComparableValue(params.agentName);
      case "name_and_id":
        return normalizeComparableValue(`${params.agentName} (${params.agentId})`);
      case "literal":
        return normalizeComparableValue(params.identity.remark.value);
      case "agent_id":
      default:
        return normalizeComparableValue(params.agentId);
    }
  })();
  return {
    selfNickname,
    remark,
  };
}

export function resolveGeweCurrentSelfNickname(
  groupInfo: GeweChatroomInfo,
  selfWxid: string,
): string | null {
  const member = groupInfo.memberList?.find((entry) => entry.wxid?.trim() === selfWxid);
  return normalizeComparableValue(member?.displayName ?? undefined);
}

function requireConfiguredAccount(account: ResolvedGeweAccount) {
  if (!account.token?.trim() || !account.appId?.trim()) {
    throw new Error(`GeWe account "${account.accountId}" is not fully configured.`);
  }
}

export async function getGeweProfile(params: {
  account: ResolvedGeweAccount;
}): Promise<GeweProfile> {
  requireConfiguredAccount(params.account);
  const resp = await postGeweJson<GeweProfile>({
    baseUrl: params.account.config.apiBaseUrl ?? "https://www.geweapi.com",
    token: params.account.token,
    path: "/gewe/v2/api/personal/getProfile",
    body: {
      appId: params.account.appId,
    },
  });
  const data = assertGeweOk(resp, "getProfile");
  return {
    wxid: data?.wxid?.trim() ?? "",
    nickName: data?.nickName?.trim() || undefined,
  };
}

export async function getGeweChatroomInfo(params: {
  account: ResolvedGeweAccount;
  groupId: string;
}): Promise<GeweChatroomInfo> {
  requireConfiguredAccount(params.account);
  const resp = await postGeweJson<GeweChatroomInfo>({
    baseUrl: params.account.config.apiBaseUrl ?? "https://www.geweapi.com",
    token: params.account.token,
    path: "/gewe/v2/api/group/getChatroomInfo",
    body: {
      appId: params.account.appId,
      chatroomId: params.groupId,
    },
  });
  const data = assertGeweOk(resp, "getChatroomInfo");
  return {
    chatroomId: data?.chatroomId?.trim() ?? params.groupId,
    nickName: data?.nickName?.trim() || undefined,
    remark: normalizeComparableValue(data?.remark ?? undefined),
    memberList: Array.isArray(data?.memberList) ? data.memberList : [],
  };
}

export async function modifyGeweChatroomRemark(params: {
  account: ResolvedGeweAccount;
  groupId: string;
  remark: string;
}) {
  requireConfiguredAccount(params.account);
  const resp = await postGeweJson({
    baseUrl: params.account.config.apiBaseUrl ?? "https://www.geweapi.com",
    token: params.account.token,
    path: "/gewe/v2/api/group/modifyChatroomRemark",
    body: {
      appId: params.account.appId,
      chatroomId: params.groupId,
      chatroomRemark: params.remark,
    },
  });
  assertGeweOk(resp, "modifyChatroomRemark");
}

export async function modifyGeweChatroomSelfNickname(params: {
  account: ResolvedGeweAccount;
  groupId: string;
  nickName: string;
}) {
  requireConfiguredAccount(params.account);
  const resp = await postGeweJson({
    baseUrl: params.account.config.apiBaseUrl ?? "https://www.geweapi.com",
    token: params.account.token,
    path: "/gewe/v2/api/group/modifyChatroomNickNameForSelf",
    body: {
      appId: params.account.appId,
      chatroomId: params.groupId,
      nickName: params.nickName,
    },
  });
  assertGeweOk(resp, "modifyChatroomNickNameForSelf");
}

export function resolveGeweBindingIdentityConfigForGroup(params: {
  accountConfig: GeweAccountConfig;
  groupId: string;
}): ResolvedGeweGroupBindingIdentity {
  const groups = params.accountConfig.groups;
  return resolveGeweGroupBindingIdentity({
    groupConfig: groups?.[params.groupId],
    wildcardConfig: groups?.["*"],
  });
}

export function resolveGeweAccountForBindingTool(params: {
  cfg: OpenClawConfig;
  accountId: string;
}): ResolvedGeweAccount {
  return resolveGeweAccount({
    cfg: params.cfg as CoreConfig,
    accountId: params.accountId,
  });
}

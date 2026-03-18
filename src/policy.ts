import {
  buildChannelKeyCandidates,
  type AllowlistMatch,
  type ChannelGroupContext,
  type GroupPolicy,
  normalizeChannelSlug,
  resolveChannelEntryMatchWithFallback,
  resolveNestedAllowlistDecision,
} from "./openclaw-compat.js";

import { mergeGeweGroups } from "./accounts.js";
import { CHANNEL_CONFIG_KEY, CHANNEL_PREFIX_REGEX } from "./constants.js";
import type {
  GeweDmConfig,
  GeweDmReplyMode,
  GeweDmTriggerMode,
  GeweGroupConfig,
  GeweGroupReplyMode,
  GeweGroupTriggerMode,
} from "./types.js";

function normalizeAllowEntry(raw: string): string {
  return raw.trim().toLowerCase().replace(CHANNEL_PREFIX_REGEX, "");
}

export function normalizeGeweAllowlist(values: Array<string | number> | undefined): string[] {
  return (values ?? []).map((value) => normalizeAllowEntry(String(value))).filter(Boolean);
}

export function resolveGeweAllowlistMatch(params: {
  allowFrom: Array<string | number> | undefined;
  senderId: string;
  senderName?: string | null;
}): AllowlistMatch<"wildcard" | "id" | "name"> {
  const allowFrom = normalizeGeweAllowlist(params.allowFrom);
  if (allowFrom.length === 0) return { allowed: false };
  if (allowFrom.includes("*")) {
    return { allowed: true, matchKey: "*", matchSource: "wildcard" };
  }
  const senderId = normalizeAllowEntry(params.senderId);
  if (allowFrom.includes(senderId)) {
    return { allowed: true, matchKey: senderId, matchSource: "id" };
  }
  const senderName = params.senderName ? normalizeAllowEntry(params.senderName) : "";
  if (senderName && allowFrom.includes(senderName)) {
    return { allowed: true, matchKey: senderName, matchSource: "name" };
  }
  return { allowed: false };
}

export type GeweGroupMatch = {
  groupConfig?: GeweGroupConfig;
  wildcardConfig?: GeweGroupConfig;
  groupKey?: string;
  matchSource?: "direct" | "parent" | "wildcard";
  allowed: boolean;
  allowlistConfigured: boolean;
};

export type GeweDmMatch = {
  dmConfig?: GeweDmConfig;
  wildcardConfig?: GeweDmConfig;
  dmKey?: string;
  matchSource?: "direct" | "parent" | "wildcard";
};

export function resolveGeweGroupMatch(params: {
  groups?: Record<string, GeweGroupConfig>;
  groupId: string;
  groupName?: string | null;
}): GeweGroupMatch {
  const groups = params.groups ?? {};
  const allowlistConfigured = Object.keys(groups).length > 0;
  const groupName = params.groupName?.trim() || undefined;
  const candidates = buildChannelKeyCandidates(
    params.groupId,
    groupName,
    groupName ? normalizeChannelSlug(groupName) : undefined,
  );
  const match = resolveChannelEntryMatchWithFallback({
    entries: groups,
    keys: candidates,
    wildcardKey: "*",
    normalizeKey: normalizeChannelSlug,
  });
  const groupConfig = match.entry;
  const allowed = resolveNestedAllowlistDecision({
    outerConfigured: allowlistConfigured,
    outerMatched: Boolean(groupConfig),
    innerConfigured: false,
    innerMatched: false,
  });

  return {
    groupConfig,
    wildcardConfig: match.wildcardEntry,
    groupKey: match.matchKey ?? match.key,
    matchSource: match.matchSource,
    allowed,
    allowlistConfigured,
  };
}

export function resolveGeweDmMatch(params: {
  dms?: Record<string, GeweDmConfig>;
  senderId: string;
  senderName?: string | null;
}): GeweDmMatch {
  const dms = params.dms ?? {};
  const senderName = params.senderName?.trim() || undefined;
  const candidates = buildChannelKeyCandidates(
    params.senderId,
    senderName,
    senderName ? normalizeChannelSlug(senderName) : undefined,
  );
  const match = resolveChannelEntryMatchWithFallback({
    entries: dms,
    keys: candidates,
    wildcardKey: "*",
    normalizeKey: normalizeChannelSlug,
  });

  return {
    dmConfig: match.entry,
    wildcardConfig: match.wildcardEntry,
    dmKey: match.matchKey ?? match.key,
    matchSource: match.matchSource,
  };
}

export function resolveGeweGroupToolPolicy(
  params: ChannelGroupContext,
): GeweGroupConfig["tools"] | undefined {
  const cfg = params.cfg as {
    channels?: {
      "gewe-openclaw"?: {
        groups?: Record<string, GeweGroupConfig>;
        accounts?: Record<string, { groups?: Record<string, GeweGroupConfig> }>;
      };
    };
  };
  const groupId = params.groupId?.trim();
  if (!groupId) return undefined;
  const groupName = params.groupChannel?.trim() || undefined;
  const baseGroups = cfg.channels?.[CHANNEL_CONFIG_KEY]?.groups;
  const accountGroups =
    params.accountId && cfg.channels?.[CHANNEL_CONFIG_KEY]?.accounts?.[params.accountId]?.groups
      ? cfg.channels?.[CHANNEL_CONFIG_KEY]?.accounts?.[params.accountId]?.groups
      : undefined;
  const groups = mergeGeweGroups(baseGroups, accountGroups);
  const match = resolveGeweGroupMatch({
    groups,
    groupId,
    groupName,
  });
  return match.groupConfig?.tools ?? match.wildcardConfig?.tools;
}

export function resolveGeweRequireMention(params: {
  groupConfig?: GeweGroupConfig;
  wildcardConfig?: GeweGroupConfig;
}): boolean {
  const triggerMode = resolveGeweGroupTriggerMode(params);
  return triggerMode === "at" || triggerMode === "at_or_quote";
}

export function resolveGeweGroupTriggerMode(params: {
  groupConfig?: GeweGroupConfig;
  wildcardConfig?: GeweGroupConfig;
}): GeweGroupTriggerMode {
  const configuredMode =
    params.groupConfig?.trigger?.mode ?? params.wildcardConfig?.trigger?.mode;
  if (configuredMode) {
    return configuredMode;
  }
  if (typeof params.groupConfig?.requireMention === "boolean") {
    return params.groupConfig.requireMention ? "at" : "any_message";
  }
  if (typeof params.wildcardConfig?.requireMention === "boolean") {
    return params.wildcardConfig.requireMention ? "at" : "any_message";
  }
  return "at";
}

export function resolveGeweDmTriggerMode(params: {
  dmConfig?: GeweDmConfig;
  wildcardConfig?: GeweDmConfig;
}): GeweDmTriggerMode {
  return params.dmConfig?.trigger?.mode ?? params.wildcardConfig?.trigger?.mode ?? "any_message";
}

export function resolveGeweGroupReplyMode(params: {
  groupConfig?: GeweGroupConfig;
  wildcardConfig?: GeweGroupConfig;
  autoQuoteReply?: boolean;
}): GeweGroupReplyMode {
  return (
    params.groupConfig?.reply?.mode ??
    params.wildcardConfig?.reply?.mode ??
    (params.autoQuoteReply === false ? "plain" : "quote_source")
  );
}

export function resolveGeweDmReplyMode(params: {
  dmConfig?: GeweDmConfig;
  wildcardConfig?: GeweDmConfig;
  autoQuoteReply?: boolean;
}): GeweDmReplyMode {
  return (
    params.dmConfig?.reply?.mode ??
    params.wildcardConfig?.reply?.mode ??
    (params.autoQuoteReply === false ? "plain" : "quote_source")
  );
}

export function resolveGeweGroupAllow(params: {
  groupPolicy: GroupPolicy;
  outerAllowFrom: Array<string | number> | undefined;
  innerAllowFrom: Array<string | number> | undefined;
  senderId: string;
  senderName?: string | null;
}): { allowed: boolean; outerMatch: AllowlistMatch; innerMatch: AllowlistMatch } {
  if (params.groupPolicy === "disabled") {
    return { allowed: false, outerMatch: { allowed: false }, innerMatch: { allowed: false } };
  }
  if (params.groupPolicy === "open") {
    return { allowed: true, outerMatch: { allowed: true }, innerMatch: { allowed: true } };
  }

  const outerAllow = normalizeGeweAllowlist(params.outerAllowFrom);
  const innerAllow = normalizeGeweAllowlist(params.innerAllowFrom);
  if (outerAllow.length === 0 && innerAllow.length === 0) {
    return { allowed: false, outerMatch: { allowed: false }, innerMatch: { allowed: false } };
  }

  const outerMatch = resolveGeweAllowlistMatch({
    allowFrom: params.outerAllowFrom,
    senderId: params.senderId,
    senderName: params.senderName,
  });
  const innerMatch = resolveGeweAllowlistMatch({
    allowFrom: params.innerAllowFrom,
    senderId: params.senderId,
    senderName: params.senderName,
  });
  const allowed = resolveNestedAllowlistDecision({
    outerConfigured: outerAllow.length > 0 || innerAllow.length > 0,
    outerMatched: outerAllow.length > 0 ? outerMatch.allowed : true,
    innerConfigured: innerAllow.length > 0,
    innerMatched: innerMatch.allowed,
  });

  return { allowed, outerMatch, innerMatch };
}

export function resolveGeweTriggerGate(params: {
  isGroup: boolean;
  triggerMode: GeweGroupTriggerMode | GeweDmTriggerMode;
  wasAtTriggered: boolean;
  wasQuoteTriggered: boolean;
  allowTextCommands: boolean;
  hasControlCommand: boolean;
  commandAuthorized: boolean;
}): { shouldSkip: boolean; shouldBypassTrigger: boolean } {
  const shouldBypassTrigger =
    params.isGroup &&
    params.allowTextCommands &&
    params.hasControlCommand &&
    params.commandAuthorized;
  if (shouldBypassTrigger) {
    return { shouldSkip: false, shouldBypassTrigger: true };
  }

  let matched = false;
  switch (params.triggerMode) {
    case "at":
      matched = params.wasAtTriggered;
      break;
    case "quote":
      matched = params.wasQuoteTriggered;
      break;
    case "at_or_quote":
      matched = params.wasAtTriggered || params.wasQuoteTriggered;
      break;
    case "any_message":
      matched = true;
      break;
    default:
      matched = false;
      break;
  }

  return { shouldSkip: !matched, shouldBypassTrigger: false };
}

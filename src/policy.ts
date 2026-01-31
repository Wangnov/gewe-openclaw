import type { AllowlistMatch, ChannelGroupContext, GroupPolicy } from "openclaw/plugin-sdk";
import {
  buildChannelKeyCandidates,
  normalizeChannelSlug,
  resolveChannelEntryMatchWithFallback,
  resolveMentionGatingWithBypass,
  resolveNestedAllowlistDecision,
} from "openclaw/plugin-sdk";

import { CHANNEL_CONFIG_KEY, CHANNEL_PREFIX_REGEX } from "./constants.js";
import type { GeweGroupConfig } from "./types.js";

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
  const accountGroups =
    params.accountId && cfg.channels?.[CHANNEL_CONFIG_KEY]?.accounts?.[params.accountId]?.groups
      ? cfg.channels?.[CHANNEL_CONFIG_KEY]?.accounts?.[params.accountId]?.groups
      : undefined;
  const groups = accountGroups ?? cfg.channels?.[CHANNEL_CONFIG_KEY]?.groups;
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
  if (typeof params.groupConfig?.requireMention === "boolean") {
    return params.groupConfig.requireMention;
  }
  if (typeof params.wildcardConfig?.requireMention === "boolean") {
    return params.wildcardConfig.requireMention;
  }
  return true;
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

export function resolveGeweMentionGate(params: {
  isGroup: boolean;
  requireMention: boolean;
  wasMentioned: boolean;
  allowTextCommands: boolean;
  hasControlCommand: boolean;
  commandAuthorized: boolean;
}): { shouldSkip: boolean; shouldBypassMention: boolean } {
  const result = resolveMentionGatingWithBypass({
    isGroup: params.isGroup,
    requireMention: params.requireMention,
    canDetectMention: true,
    wasMentioned: params.wasMentioned,
    allowTextCommands: params.allowTextCommands,
    hasControlCommand: params.hasControlCommand,
    commandAuthorized: params.commandAuthorized,
  });
  return { shouldSkip: result.shouldSkip, shouldBypassMention: result.shouldBypassMention };
}

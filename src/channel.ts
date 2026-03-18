import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  missingTargetError,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
  type OpenClawConfig,
  type ChannelSetupInput,
  type ReplyPayload,
} from "./openclaw-compat.js";

import { resolveGeweAccount, resolveDefaultGeweAccountId, listGeweAccountIds } from "./accounts.js";
import { geweMessageActions } from "./channel-actions.js";
import { geweAllowlist } from "./channel-allowlist.js";
import { geweDirectory } from "./channel-directory.js";
import { geweStatus } from "./channel-status.js";
import { GeweConfigSchema } from "./config-schema.js";
import {
  CHANNEL_ALIASES,
  CHANNEL_CONFIG_KEY,
  CHANNEL_DOCS_LABEL,
  CHANNEL_DOCS_PATH,
  CHANNEL_ID,
  stripChannelPrefix,
} from "./constants.js";
import { deliverGewePayload } from "./delivery.js";
import { monitorGeweProvider } from "./monitor.js";
import { looksLikeGeweTargetId, normalizeGeweMessagingTarget } from "./normalize.js";
import { resolveGeweGroupToolPolicy, resolveGeweRequireMention } from "./policy.js";
import { getGeweRuntime } from "./runtime.js";
import { sendTextGewe } from "./send.js";
import { geweSetupWizard } from "./setup-wizard.js";
import type { GeweChannelPlugin } from "./setup-wizard-types.js";
import { normalizeGeweBindingConversationId } from "./group-binding.js";
import type { CoreConfig, ResolvedGeweAccount } from "./types.js";

const meta = {
  id: CHANNEL_ID,
  label: "GeWe",
  selectionLabel: "WeChat (GeWe)",
  detailLabel: "WeChat (GeWe)",
  docsPath: CHANNEL_DOCS_PATH,
  docsLabel: CHANNEL_DOCS_LABEL,
  blurb: "WeChat channel via GeWe API and webhook callbacks.",
  aliases: [...CHANNEL_ALIASES],
  order: 72,
  quickstartAllowFrom: true,
};

type GeweSetupInput = ChannelSetupInput & {
  token?: string;
  tokenFile?: string;
  appId?: string;
  appIdFile?: string;
  apiBaseUrl?: string;
};

const GEWE_QUOTE_PARTIAL_DIRECTIVE_RE = /(?:\r?\n)?\s*\[\[GEWE_QUOTE_PARTIAL:([\s\S]*?)\]\]\s*$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function withGeweScopedChannelData(
  payload: ReplyPayload,
  updater: (scoped: Record<string, unknown>) => Record<string, unknown>,
): ReplyPayload {
  const channelData = asRecord(payload.channelData) ?? {};
  const existingChannelScoped = asRecord(channelData[CHANNEL_ID]);
  const existingLegacyScoped = asRecord(channelData.gewe);
  const targetKey = existingChannelScoped ? CHANNEL_ID : existingLegacyScoped ? "gewe" : CHANNEL_ID;
  const scoped = existingChannelScoped ?? existingLegacyScoped ?? {};

  return {
    ...payload,
    channelData: {
      ...channelData,
      [targetKey]: updater(scoped),
    },
  };
}

function parseGeweQuotePartialDirective(text: string | undefined): {
  cleanedText: string;
  partialText: string;
} | null {
  if (typeof text !== "string") return null;
  const match = GEWE_QUOTE_PARTIAL_DIRECTIVE_RE.exec(text);
  if (!match) return null;
  const partialText = match[1]?.trim();
  if (!partialText) return null;
  const cleanedText = text.slice(0, match.index).replace(/\s+$/, "");
  return {
    cleanedText,
    partialText,
  };
}

function resolvePayloadMediaEntries(payload: ReplyPayload): string[] {
  const mediaUrls = payload.mediaUrls?.map((entry) => entry?.trim()).filter(Boolean);
  if (mediaUrls?.length) {
    return mediaUrls;
  }
  const mediaUrl = payload.mediaUrl?.trim();
  return mediaUrl ? [mediaUrl] : [];
}

function normalizeGeweOutboundPayload(payload: ReplyPayload): ReplyPayload {
  let normalized = payload;

  const partialDirective = parseGeweQuotePartialDirective(payload.text);
  if (partialDirective) {
    normalized = {
      ...normalized,
      text: partialDirective.cleanedText,
    };
    normalized = withGeweScopedChannelData(normalized, (scoped) => {
      const quoteReply = asRecord(scoped.quoteReply);
      const existingPartialText = asRecord(quoteReply?.partialText);
      if (existingPartialText?.text) {
        return scoped;
      }
      return {
        ...scoped,
        quoteReply: {
          ...(quoteReply ?? {}),
          partialText: {
            ...existingPartialText,
            text: partialDirective.partialText,
          },
        },
      };
    });
  }

  if (normalized.audioAsVoice !== true || resolvePayloadMediaEntries(normalized).length !== 1) {
    return normalized;
  }

  return withGeweScopedChannelData(normalized, (scoped) => ({
    ...scoped,
    audioAsVoice: true,
  }));
}

const gewePairing = {
  idLabel: "wechatUserId",
  mode: "code" as const,
  normalizeAllowEntry: (entry: string) => stripChannelPrefix(entry),
  notifyApproval: async ({ cfg, id }: { cfg: OpenClawConfig; id: string }) => {
    const account = resolveGeweAccount({ cfg: cfg as CoreConfig });
    if (!account.token || !account.appId) {
      throw new Error("GeWe token/appId not configured");
    }
    await sendTextGewe({
      account,
      toWxid: id,
      content: PAIRING_APPROVED_MESSAGE,
    });
  },
};

export const gewePlugin: GeweChannelPlugin<ResolvedGeweAccount> = {
  id: CHANNEL_ID,
  meta,
  setupWizard: geweSetupWizard,
  pairing: gewePairing as GeweChannelPlugin<ResolvedGeweAccount>["pairing"],
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: true,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: [`channels.${CHANNEL_CONFIG_KEY}`] },
  configSchema: buildChannelConfigSchema(GeweConfigSchema),
  config: {
    listAccountIds: (cfg) => listGeweAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) => resolveGeweAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultGeweAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: CHANNEL_CONFIG_KEY,
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: CHANNEL_CONFIG_KEY,
        accountId,
        clearBaseFields: ["token", "tokenFile", "appId", "appIdFile", "name"],
      }),
    isConfigured: (account) => Boolean(account.token?.trim() && account.appId?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.token?.trim() && account.appId?.trim()),
      tokenSource: account.tokenSource,
      baseUrl: account.config.apiBaseUrl ? "[set]" : "[missing]",
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveGeweAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom ?? []).map(
        (entry) => String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => stripChannelPrefix(entry)),
  },
  allowlist: geweAllowlist,
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        cfg.channels?.[CHANNEL_CONFIG_KEY]?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.${CHANNEL_CONFIG_KEY}.accounts.${resolvedAccountId}.`
        : `channels.${CHANNEL_CONFIG_KEY}.`;
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: "Issue a pair code with: openclaw pairing code create gewe-openclaw",
        normalizeEntry: (raw) => stripChannelPrefix(raw),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") return [];
      const groupAllowlistConfigured =
        account.config.groups && Object.keys(account.config.groups).length > 0;
      if (groupAllowlistConfigured) {
        return [
          `- GeWe groups: groupPolicy="open" allows any member in allowed groups to trigger (at-gated by default). Set channels.${CHANNEL_CONFIG_KEY}.groupPolicy="allowlist" + channels.${CHANNEL_CONFIG_KEY}.groupAllowFrom to restrict senders.`,
        ];
      }
      return [
        `- GeWe groups: groupPolicy="open" with no channels.${CHANNEL_CONFIG_KEY}.groups allowlist; any group can add + at (at-gated by default). Set channels.${CHANNEL_CONFIG_KEY}.groupPolicy="allowlist" + channels.${CHANNEL_CONFIG_KEY}.groupAllowFrom or configure channels.${CHANNEL_CONFIG_KEY}.groups.`,
      ];
    },
  },
  bindings: {
    compileConfiguredBinding: ({ conversationId }) => {
      const normalized = normalizeGeweBindingConversationId(conversationId);
      return normalized
        ? {
            conversationId: normalized,
          }
        : null;
    },
    matchInboundConversation: ({ compiledBinding, conversationId }) => {
      const normalized = normalizeGeweBindingConversationId(conversationId);
      if (!normalized || normalized !== compiledBinding.conversationId) {
        return null;
      }
      return {
        conversationId: normalized,
        matchPriority: 2,
      };
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, groupId, accountId }) => {
      const account = resolveGeweAccount({ cfg: cfg as CoreConfig, accountId });
      const groups = account.config.groups;
      if (!groups || !groupId) return true;
      const groupConfig = groups[groupId] ?? groups["*"];
      return resolveGeweRequireMention({
        groupConfig,
        wildcardConfig: groups["*"],
      });
    },
    resolveToolPolicy: resolveGeweGroupToolPolicy,
  },
  messaging: {
    normalizeTarget: (raw) => normalizeGeweMessagingTarget(raw) ?? undefined,
    targetResolver: {
      looksLikeId: looksLikeGeweTargetId,
      hint: "<wxid|@chatroom>",
    },
  },
  directory: geweDirectory,
  actions: geweMessageActions,
  outbound: {
    deliveryMode: "direct",
    normalizePayload: ({ payload }) => normalizeGeweOutboundPayload(payload),
    chunker: (text, limit) => {
      const core = getGeweRuntime();
      return core.channel.text.chunkMarkdownText(text, limit);
    },
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    resolveTarget: ({ to, allowFrom, mode }) => {
      const trimmed = to?.trim() ?? "";
      const allowListRaw = (allowFrom ?? []).map((entry) => String(entry).trim()).filter(Boolean);
      const allowList = allowListRaw
        .filter((entry) => entry !== "*")
        .map((entry) => normalizeGeweMessagingTarget(entry))
        .filter((entry): entry is string => Boolean(entry));

      if (trimmed) {
        const normalized = normalizeGeweMessagingTarget(trimmed);
        if (!normalized) {
          if ((mode === "implicit" || mode === "heartbeat") && allowList.length > 0) {
            return { ok: true, to: allowList[0] };
          }
          return {
            ok: false,
            error: missingTargetError(
              "GeWe",
              `<wxid|@chatroom> or channels.${CHANNEL_CONFIG_KEY}.allowFrom[0]`,
            ),
          };
        }
        return { ok: true, to: normalized };
      }

      if (allowList.length > 0) {
        return { ok: true, to: allowList[0] };
      }
      return {
        ok: false,
        error: missingTargetError(
          "GeWe",
          `<wxid|@chatroom> or channels.${CHANNEL_CONFIG_KEY}.allowFrom[0]`,
        ),
      };
    },
    sendPayload: async ({ payload, cfg, to, accountId }) => {
      const account = resolveGeweAccount({ cfg: cfg as CoreConfig, accountId });
      const result = await deliverGewePayload({
        payload,
        account,
        cfg: cfg as OpenClawConfig,
        toWxid: to,
      });
      return {
        channel: CHANNEL_ID,
        messageId: result?.messageId ?? "ok",
        timestamp: result?.timestamp,
        meta: { newMessageId: result?.newMessageId },
      };
    },
    sendText: async ({ cfg, to, text, accountId }) => {
      const account = resolveGeweAccount({ cfg: cfg as CoreConfig, accountId });
      const result = await deliverGewePayload({
        payload: { text },
        account,
        cfg: cfg as OpenClawConfig,
        toWxid: to,
      });
      return {
        channel: CHANNEL_ID,
        messageId: result?.messageId ?? "ok",
        timestamp: result?.timestamp,
        meta: { newMessageId: result?.newMessageId },
      };
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
      const account = resolveGeweAccount({ cfg: cfg as CoreConfig, accountId });
      const result = await deliverGewePayload({
        payload: { text, mediaUrl },
        account,
        cfg: cfg as OpenClawConfig,
        toWxid: to,
      });
      return {
        channel: CHANNEL_ID,
        messageId: result?.messageId ?? "ok",
        timestamp: result?.timestamp,
        meta: { newMessageId: result?.newMessageId },
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    ...geweStatus,
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      if (!account.token || !account.appId) {
        throw new Error(
          `GeWe not configured for account "${account.accountId}" (missing token/appId)`,
        );
      }
      ctx.log?.info(`[${account.accountId}] starting GeWe webhook server`);
      const { stop } = await monitorGeweProvider({
        accountId: account.accountId,
        account,
        config: ctx.cfg as CoreConfig,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
      return { stop };
    },
    logoutAccount: async ({ accountId, cfg }) => {
      const nextCfg = { ...cfg } as OpenClawConfig;
      const nextSection = cfg.channels?.[CHANNEL_CONFIG_KEY]
        ? { ...(cfg.channels?.[CHANNEL_CONFIG_KEY] as Record<string, unknown>) }
        : undefined;
      let cleared = false;
      let changed = false;

      if (nextSection) {
        if (accountId === DEFAULT_ACCOUNT_ID) {
          if (nextSection.token) {
            delete nextSection.token;
            cleared = true;
            changed = true;
          }
          if (nextSection.tokenFile) {
            delete nextSection.tokenFile;
            cleared = true;
            changed = true;
          }
          if (nextSection.appId) {
            delete nextSection.appId;
            cleared = true;
            changed = true;
          }
          if (nextSection.appIdFile) {
            delete nextSection.appIdFile;
            cleared = true;
            changed = true;
          }
        }

        const accounts =
          nextSection.accounts && typeof nextSection.accounts === "object"
            ? ({ ...nextSection.accounts } as Record<string, Record<string, unknown>>)
            : undefined;
        if (accounts && accountId in accounts) {
          const entry = accounts[accountId];
          if (entry && typeof entry === "object") {
            const nextEntry = { ...entry } as Record<string, unknown>;
            if ("token" in nextEntry) {
              if (nextEntry.token) cleared = true;
              delete nextEntry.token;
              changed = true;
            }
            if ("tokenFile" in nextEntry) {
              if (nextEntry.tokenFile) cleared = true;
              delete nextEntry.tokenFile;
              changed = true;
            }
            if ("appId" in nextEntry) {
              if (nextEntry.appId) cleared = true;
              delete nextEntry.appId;
              changed = true;
            }
            if ("appIdFile" in nextEntry) {
              if (nextEntry.appIdFile) cleared = true;
              delete nextEntry.appIdFile;
              changed = true;
            }
            if (Object.keys(nextEntry).length === 0) {
              delete accounts[accountId];
              changed = true;
            } else {
              accounts[accountId] = nextEntry as typeof entry;
            }
          }
        }

        nextSection.accounts =
          accounts && Object.keys(accounts).length > 0 ? accounts : undefined;
        if (changed) {
          nextCfg.channels = {
            ...nextCfg.channels,
            [CHANNEL_CONFIG_KEY]: nextSection,
          };
        }
      }

      return { cleared, loggedOut: cleared, nextCfg };
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg as OpenClawConfig,
        channelKey: CHANNEL_CONFIG_KEY,
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      const setupInput = input as GeweSetupInput;
      if (setupInput.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "GEWE_TOKEN/GEWE_APP_ID can only be used for the default account.";
      }
      if (!setupInput.useEnv && !setupInput.token && !setupInput.tokenFile) {
        return "GeWe requires --token or --token-file (or --use-env).";
      }
      if (!setupInput.useEnv && !setupInput.appId && !setupInput.appIdFile) {
        return "GeWe requires --app-id or --app-id-file (or --use-env).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const setupInput = input as GeweSetupInput;
      const namedConfig = applyAccountNameToChannelSection({
        cfg: cfg as OpenClawConfig,
        channelKey: CHANNEL_CONFIG_KEY,
        accountId,
        name: setupInput.name,
      });
      const section = (namedConfig.channels?.[CHANNEL_CONFIG_KEY] ?? {}) as Record<
        string,
        unknown
      > & {
        accounts?: Record<string, Record<string, unknown>>;
      };
      const useAccountPath = accountId !== DEFAULT_ACCOUNT_ID;
      const base = useAccountPath
        ? section.accounts?.[accountId] ?? {}
        : section;
      const nextEntry = {
        ...base,
        ...(setupInput.apiBaseUrl ? { apiBaseUrl: setupInput.apiBaseUrl } : {}),
        ...(setupInput.useEnv
          ? {}
          : setupInput.token
            ? { token: setupInput.token }
            : setupInput.tokenFile
              ? { tokenFile: setupInput.tokenFile }
              : {}),
        ...(setupInput.useEnv
          ? {}
          : setupInput.appId
            ? { appId: setupInput.appId }
            : setupInput.appIdFile
              ? { appIdFile: setupInput.appIdFile }
              : {}),
      };
      if (!useAccountPath) {
        return {
          ...namedConfig,
          channels: {
            ...namedConfig.channels,
            [CHANNEL_CONFIG_KEY]: nextEntry,
          },
        };
      }
      return {
        ...namedConfig,
        channels: {
          ...namedConfig.channels,
          [CHANNEL_CONFIG_KEY]: {
            ...section,
            accounts: {
              ...(section.accounts as Record<string, unknown> | undefined),
              [accountId]: nextEntry,
            },
          },
        },
      };
    },
  },
};

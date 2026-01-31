import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  missingTargetError,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
  type OpenClawConfig,
  type ChannelSetupInput,
} from "openclaw/plugin-sdk";

import { resolveGeweAccount, resolveDefaultGeweAccountId, listGeweAccountIds } from "./accounts.js";
import { GeweConfigSchema } from "./config-schema.js";
import { deliverGewePayload } from "./delivery.js";
import { monitorGeweProvider } from "./monitor.js";
import { looksLikeGeweTargetId, normalizeGeweMessagingTarget } from "./normalize.js";
import { resolveGeweGroupToolPolicy, resolveGeweRequireMention } from "./policy.js";
import { getGeweRuntime } from "./runtime.js";
import { sendTextGewe } from "./send.js";
import type { CoreConfig, ResolvedGeweAccount } from "./types.js";

const meta = {
  id: "gewe",
  label: "GeWe",
  selectionLabel: "WeChat (GeWe)",
  detailLabel: "WeChat (GeWe)",
  docsPath: "/channels/gewe",
  docsLabel: "gewe",
  blurb: "WeChat channel via GeWe API and webhook callbacks.",
  aliases: ["wechat", "wx", "gewe"],
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

export const gewePlugin: ChannelPlugin<ResolvedGeweAccount> = {
  id: "gewe",
  meta,
  pairing: {
    idLabel: "wechatUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(gewe|wechat|wx):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
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
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: true,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.gewe"] },
  configSchema: buildChannelConfigSchema(GeweConfigSchema),
  config: {
    listAccountIds: (cfg) => listGeweAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) => resolveGeweAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultGeweAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "gewe",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "gewe",
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
        .map((entry) => entry.replace(/^(gewe|wechat|wx):/i, "")),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        cfg.channels?.gewe?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.gewe.accounts.${resolvedAccountId}.`
        : "channels.gewe.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("gewe"),
        normalizeEntry: (raw) => raw.replace(/^(gewe|wechat|wx):/i, ""),
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
          `- GeWe groups: groupPolicy="open" allows any member in allowed groups to trigger (mention-gated). Set channels.gewe.groupPolicy="allowlist" + channels.gewe.groupAllowFrom to restrict senders.`,
        ];
      }
      return [
        `- GeWe groups: groupPolicy="open" with no channels.gewe.groups allowlist; any group can add + ping (mention-gated). Set channels.gewe.groupPolicy="allowlist" + channels.gewe.groupAllowFrom or configure channels.gewe.groups.`,
      ];
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
    normalizeTarget: normalizeGeweMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeGeweTargetId,
      hint: "<wxid|@chatroom>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => {
      const core = getGeweRuntime();
      return core.channel.text.chunkMarkdownText(text, limit);
    },
    chunkerMode: "markdown",
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
            error: missingTargetError("GeWe", "<wxid|@chatroom> or channels.gewe.allowFrom[0]"),
          };
        }
        return { ok: true, to: normalized };
      }

      if (allowList.length > 0) {
        return { ok: true, to: allowList[0] };
      }
      return {
        ok: false,
        error: missingTargetError("GeWe", "<wxid|@chatroom> or channels.gewe.allowFrom[0]"),
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
        channel: "gewe",
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
        channel: "gewe",
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
        channel: "gewe",
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
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      running: snapshot.running ?? false,
      mode: snapshot.mode ?? null,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      lastInboundAt: snapshot.lastInboundAt ?? null,
      lastOutboundAt: snapshot.lastOutboundAt ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => {
      const configured = Boolean(account.token?.trim() && account.appId?.trim());
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
      };
    },
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
      const nextSection = cfg.channels?.gewe ? { ...cfg.channels.gewe } : undefined;
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
            ? { ...nextSection.accounts }
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
            gewe: nextSection,
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
        channelKey: "gewe",
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
        channelKey: "gewe",
        accountId,
        name: setupInput.name,
      });
      const section = (namedConfig.channels?.gewe ?? {}) as Record<string, unknown>;
      const useAccountPath = accountId !== DEFAULT_ACCOUNT_ID;
      const base = useAccountPath
        ? (section.accounts?.[accountId] as Record<string, unknown> | undefined) ?? {}
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
            gewe: nextEntry,
          },
        };
      }
      return {
        ...namedConfig,
        channels: {
          ...namedConfig.channels,
          gewe: {
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

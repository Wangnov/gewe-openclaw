import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
  type ChannelSetupInput,
  type OpenClawConfig,
} from "./openclaw-compat.js";

import { resolveDefaultGeweAccountId, listGeweAccountIds, resolveGeweAccount } from "./accounts.js";
import { GeweConfigSchema } from "./config-schema.js";
import {
  CHANNEL_ALIASES,
  CHANNEL_CONFIG_KEY,
  CHANNEL_DOCS_LABEL,
  CHANNEL_DOCS_PATH,
  CHANNEL_ID,
  stripChannelPrefix,
} from "./constants.js";
import { geweSetupWizard } from "./setup-wizard.js";
import type { CoreConfig, ResolvedGeweAccount } from "./types.js";

type GeweSetupInput = ChannelSetupInput & {
  token?: string;
  tokenFile?: string;
  appId?: string;
  appIdFile?: string;
  apiBaseUrl?: string;
};

export const geweChannelMeta = {
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
} as const;

export const geweSetupAdapter: NonNullable<ChannelPlugin<ResolvedGeweAccount>["setup"]> = {
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
    const base = useAccountPath ? section.accounts?.[accountId] ?? {} : section;
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
};

export const geweChannelPluginCommon = {
  meta: geweChannelMeta,
  setupWizard: geweSetupWizard,
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
    listAccountIds: (cfg: OpenClawConfig) => listGeweAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) =>
      resolveGeweAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg: OpenClawConfig) => resolveDefaultGeweAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }: { cfg: OpenClawConfig; accountId: string; enabled: boolean }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: CHANNEL_CONFIG_KEY,
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: CHANNEL_CONFIG_KEY,
        accountId,
        clearBaseFields: ["token", "tokenFile", "appId", "appIdFile", "name"],
      }),
    isConfigured: (account: ResolvedGeweAccount) => Boolean(account.token?.trim() && account.appId?.trim()),
    describeAccount: (account: ResolvedGeweAccount) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.token?.trim() && account.appId?.trim()),
      tokenSource: account.tokenSource,
      baseUrl: account.config.apiBaseUrl ? "[set]" : "[missing]",
    }),
    resolveAllowFrom: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId?: string | null }) =>
      (resolveGeweAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom ?? []).map(
        (entry) => String(entry),
      ),
    formatAllowFrom: ({ allowFrom }: { allowFrom: Array<string | number> }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => stripChannelPrefix(entry)),
  },
  setup: geweSetupAdapter,
} satisfies Pick<
  ChannelPlugin<ResolvedGeweAccount>,
  "meta" | "setupWizard" | "capabilities" | "reload" | "configSchema" | "config" | "setup"
>;

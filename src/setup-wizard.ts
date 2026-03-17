import { DEFAULT_ACCOUNT_ID, type OpenClawConfig } from "openclaw/plugin-sdk";

import { listGeweAccountIds, resolveGeweAccount } from "./accounts.js";
import { CHANNEL_CONFIG_KEY, CHANNEL_ID, stripChannelPrefix } from "./constants.js";
import type { GeweSetupWizard } from "./setup-wizard-types.js";
import type { CoreConfig, GeweAccountConfig } from "./types.js";

const DEFAULT_WEBHOOK_HOST = "0.0.0.0";
const DEFAULT_WEBHOOK_PORT = 4399;
const DEFAULT_WEBHOOK_PATH = "/webhook";
const DEFAULT_MEDIA_HOST = "0.0.0.0";
const DEFAULT_MEDIA_PORT = 4400;
const DEFAULT_MEDIA_PATH = "/gewe-media";
const DEFAULT_API_BASE_URL = "https://www.geweapi.com";

type ChannelSection = GeweAccountConfig & {
  accounts?: Record<string, GeweAccountConfig>;
};

function readChannelSection(cfg: OpenClawConfig): ChannelSection {
  return (cfg.channels?.[CHANNEL_CONFIG_KEY] ?? {}) as ChannelSection;
}

function readAccountConfig(cfg: OpenClawConfig, accountId: string): GeweAccountConfig {
  const section = readChannelSection(cfg);
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return section;
  }
  return section.accounts?.[accountId] ?? {};
}

function setGeweAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
  patch: Partial<GeweAccountConfig>,
): OpenClawConfig {
  const section = readChannelSection(cfg);
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        [CHANNEL_CONFIG_KEY]: {
          ...section,
          enabled: true,
          ...patch,
        },
      },
    };
  }

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      [CHANNEL_CONFIG_KEY]: {
        ...section,
        enabled: true,
        accounts: {
          ...(section.accounts ?? {}),
          [accountId]: {
            ...(section.accounts?.[accountId] ?? {}),
            enabled: true,
            ...patch,
          },
        },
      },
    },
  };
}

function clearGeweAccountFields(
  cfg: OpenClawConfig,
  accountId: string,
  fields: Array<keyof GeweAccountConfig>,
): OpenClawConfig {
  const section = readChannelSection(cfg);
  if (accountId === DEFAULT_ACCOUNT_ID) {
    const next = { ...section } as ChannelSection;
    for (const field of fields) {
      delete next[field];
    }
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        [CHANNEL_CONFIG_KEY]: next,
      },
    };
  }

  const accounts = { ...(section.accounts ?? {}) };
  const entry = { ...(accounts[accountId] ?? {}) };
  for (const field of fields) {
    delete entry[field];
  }
  accounts[accountId] = entry;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      [CHANNEL_CONFIG_KEY]: {
        ...section,
        accounts,
      },
    },
  };
}

function parseAllowFrom(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((entry) => stripChannelPrefix(entry.trim()))
    .filter(Boolean);
}

async function promptOptionalAllowFrom(params: {
  cfg: OpenClawConfig;
  accountId: string;
  prompter: {
    confirm: (params: { message: string; initialValue?: boolean }) => Promise<boolean>;
    text: (params: {
      message: string;
      placeholder?: string;
      initialValue?: string;
      validate?: (value: string) => string | undefined;
    }) => Promise<string>;
  };
}): Promise<OpenClawConfig> {
  const existing = readAccountConfig(params.cfg, params.accountId).allowFrom ?? [];
  const wantsAllowlist = await params.prompter.confirm({
    message: "Set a DM allowlist now? (optional)",
    initialValue: existing.length > 0,
  });
  if (!wantsAllowlist) {
    return params.cfg;
  }
  const raw = await params.prompter.text({
    message: "Allowlist wxid (comma or newline separated)",
    placeholder: "wxid_xxx, wxid_yyy",
    initialValue: existing.map((entry) => String(entry)).join(", "),
    validate: (value) => (parseAllowFrom(value).length > 0 ? undefined : "Required"),
  });
  return setGeweAccountConfig(params.cfg, params.accountId, {
    allowFrom: parseAllowFrom(raw),
    dmPolicy: "allowlist",
  });
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export const geweSetupWizard: GeweSetupWizard = {
  channel: CHANNEL_ID,
  status: {
    configuredLabel: "configured",
    unconfiguredLabel: "needs token + appId",
    configuredHint: "configured",
    unconfiguredHint: "needs token + appId",
    configuredScore: 1,
    unconfiguredScore: 0,
    resolveConfigured: ({ cfg }) =>
      listGeweAccountIds(cfg as CoreConfig).some((accountId) => {
        const account = resolveGeweAccount({ cfg: cfg as CoreConfig, accountId });
        return Boolean(account.token?.trim() && account.appId?.trim());
      }),
    resolveStatusLines: ({ cfg, configured }) => [
      `GeWe: ${configured ? "configured" : "needs token + appId"}`,
      `Accounts: ${listGeweAccountIds(cfg as CoreConfig).length || 0}`,
    ],
  },
  introNote: {
    title: "GeWe setup",
    lines: [
      "You will need:",
      "- GeWe token + appId",
      "- Public webhook endpoint (FRP or reverse proxy)",
      "- Public media base URL (optional proxy fallback)",
      "Docs: /channels/gewe-openclaw",
    ],
    shouldShow: ({ cfg, accountId }) => {
      const account = resolveGeweAccount({ cfg: cfg as CoreConfig, accountId });
      return !account.token?.trim() || !account.appId?.trim();
    },
  },
  credentials: [
    {
      inputKey: "token",
      providerHint: CHANNEL_ID,
      credentialLabel: "token",
      preferredEnvVar: "GEWE_TOKEN",
      envPrompt: "GEWE_TOKEN detected. Use env var?",
      keepPrompt: "GeWe token already configured. Keep it?",
      inputPrompt: "Enter GeWe token",
      allowEnv: ({ accountId }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }) => {
        const account = resolveGeweAccount({ cfg: cfg as CoreConfig, accountId });
        return {
          accountConfigured: Boolean(account.token?.trim() && account.appId?.trim()),
          hasConfiguredValue: Boolean(
            readAccountConfig(cfg, accountId).token?.trim() ||
              readAccountConfig(cfg, accountId).tokenFile?.trim(),
          ),
          resolvedValue: account.token?.trim() || undefined,
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? process.env.GEWE_TOKEN?.trim() || undefined
              : undefined,
        };
      },
      applyUseEnv: ({ cfg, accountId }) =>
        clearGeweAccountFields(cfg, accountId, ["token", "tokenFile"]),
      applySet: ({ cfg, accountId, resolvedValue }) =>
        setGeweAccountConfig(clearGeweAccountFields(cfg, accountId, ["tokenFile"]), accountId, {
          token: resolvedValue,
        }),
    },
    {
      inputKey: "appId",
      providerHint: `${CHANNEL_ID}-app`,
      credentialLabel: "appId",
      preferredEnvVar: "GEWE_APP_ID",
      envPrompt: "GEWE_APP_ID detected. Use env var?",
      keepPrompt: "GeWe appId already configured. Keep it?",
      inputPrompt: "Enter GeWe appId",
      allowEnv: ({ accountId }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }) => {
        const account = resolveGeweAccount({ cfg: cfg as CoreConfig, accountId });
        return {
          accountConfigured: Boolean(account.token?.trim() && account.appId?.trim()),
          hasConfiguredValue: Boolean(
            readAccountConfig(cfg, accountId).appId?.trim() ||
              readAccountConfig(cfg, accountId).appIdFile?.trim(),
          ),
          resolvedValue: account.appId?.trim() || undefined,
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? process.env.GEWE_APP_ID?.trim() || undefined
              : undefined,
        };
      },
      applyUseEnv: ({ cfg, accountId }) =>
        clearGeweAccountFields(cfg, accountId, ["appId", "appIdFile"]),
      applySet: ({ cfg, accountId, resolvedValue }) =>
        setGeweAccountConfig(clearGeweAccountFields(cfg, accountId, ["appIdFile"]), accountId, {
          appId: resolvedValue,
        }),
    },
  ],
  textInputs: [
    {
      inputKey: "apiBaseUrl",
      message: "GeWe API base URL",
      currentValue: ({ cfg, accountId }) => readAccountConfig(cfg, accountId).apiBaseUrl,
      initialValue: ({ cfg, accountId }) =>
        readAccountConfig(cfg, accountId).apiBaseUrl ?? DEFAULT_API_BASE_URL,
      validate: ({ value }) => (value.trim() ? undefined : "Required"),
      normalizeValue: ({ value }) => trimTrailingSlash(value),
      applySet: ({ cfg, accountId, value }) =>
        setGeweAccountConfig(cfg, accountId, { apiBaseUrl: trimTrailingSlash(value) }),
    },
    {
      inputKey: "httpHost",
      message: "Webhook host",
      currentValue: ({ cfg, accountId }) => readAccountConfig(cfg, accountId).webhookHost,
      initialValue: ({ cfg, accountId }) =>
        readAccountConfig(cfg, accountId).webhookHost ?? DEFAULT_WEBHOOK_HOST,
      validate: ({ value }) => (value.trim() ? undefined : "Required"),
      applySet: ({ cfg, accountId, value }) =>
        setGeweAccountConfig(cfg, accountId, { webhookHost: value.trim() }),
    },
    {
      inputKey: "httpPort",
      message: "Webhook port",
      currentValue: ({ cfg, accountId }) => {
        const port = readAccountConfig(cfg, accountId).webhookPort;
        return typeof port === "number" ? String(port) : undefined;
      },
      initialValue: ({ cfg, accountId }) =>
        String(readAccountConfig(cfg, accountId).webhookPort ?? DEFAULT_WEBHOOK_PORT),
      validate: ({ value }) => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0 ? undefined : "Must be a positive integer";
      },
      applySet: ({ cfg, accountId, value }) =>
        setGeweAccountConfig(cfg, accountId, { webhookPort: Number(value) }),
    },
    {
      inputKey: "webhookPath",
      message: "Webhook path",
      currentValue: ({ cfg, accountId }) => readAccountConfig(cfg, accountId).webhookPath,
      initialValue: ({ cfg, accountId }) =>
        readAccountConfig(cfg, accountId).webhookPath ?? DEFAULT_WEBHOOK_PATH,
      validate: ({ value }) => (value.trim() ? undefined : "Required"),
      normalizeValue: ({ value }) => {
        const trimmed = value.trim();
        return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
      },
      applySet: ({ cfg, accountId, value }) =>
        setGeweAccountConfig(cfg, accountId, {
          webhookPath: value.trim().startsWith("/") ? value.trim() : `/${value.trim()}`,
        }),
    },
    {
      inputKey: "mediaPublicUrl",
      message: "Media public URL (prefix)",
      placeholder: "https://your-domain/gewe-media",
      required: false,
      applyEmptyValue: true,
      currentValue: ({ cfg, accountId }) => readAccountConfig(cfg, accountId).mediaPublicUrl,
      applySet: ({ cfg, accountId, value }) =>
        setGeweAccountConfig(cfg, accountId, {
          mediaHost: readAccountConfig(cfg, accountId).mediaHost ?? DEFAULT_MEDIA_HOST,
          mediaPort: readAccountConfig(cfg, accountId).mediaPort ?? DEFAULT_MEDIA_PORT,
          mediaPath: readAccountConfig(cfg, accountId).mediaPath ?? DEFAULT_MEDIA_PATH,
          mediaPublicUrl: value.trim() || undefined,
        }),
    },
  ],
  allowFrom: {
    message: "Allowlist wxid (comma or newline separated)",
    placeholder: "wxid_xxx, wxid_yyy",
    invalidWithoutCredentialNote: "GeWe allowFrom requires raw wxid values.",
    parseInputs: parseAllowFrom,
    parseId: (raw) => {
      const value = stripChannelPrefix(raw.trim());
      return value || null;
    },
    resolveEntries: async ({ entries }) =>
      entries.map((entry) => {
        const id = stripChannelPrefix(entry.trim());
        return {
          input: entry,
          resolved: Boolean(id),
          id: id || null,
        };
      }),
    apply: ({ cfg, accountId, allowFrom }) =>
      setGeweAccountConfig(cfg, accountId, {
        allowFrom,
        dmPolicy: "allowlist",
      }),
  },
  finalize: async ({ cfg, accountId, prompter, forceAllowFrom }) => {
    let next = cfg;
    const existing = readAccountConfig(next, accountId);

    const enableS3 = await prompter.confirm({
      message: "Enable S3-compatible media delivery?",
      initialValue: existing.s3Enabled === true,
    });
    if (enableS3) {
      const s3Endpoint = await prompter.text({
        message: "S3 endpoint",
        placeholder: "https://s3.amazonaws.com",
        initialValue: existing.s3Endpoint,
        validate: (value) => (value.trim() ? undefined : "Required"),
      });
      const s3Region = await prompter.text({
        message: "S3 region",
        placeholder: "us-east-1",
        initialValue: existing.s3Region,
        validate: (value) => (value.trim() ? undefined : "Required"),
      });
      const s3Bucket = await prompter.text({
        message: "S3 bucket",
        initialValue: existing.s3Bucket,
        validate: (value) => (value.trim() ? undefined : "Required"),
      });
      const s3AccessKeyId = await prompter.text({
        message: "S3 access key id",
        initialValue: existing.s3AccessKeyId,
        validate: (value) => (value.trim() ? undefined : "Required"),
      });
      const s3SecretAccessKey = await prompter.text({
        message: "S3 secret access key",
        initialValue: existing.s3SecretAccessKey,
        validate: (value) => (value.trim() ? undefined : "Required"),
      });
      const s3SessionToken = await prompter.text({
        message: "S3 session token (optional)",
        initialValue: existing.s3SessionToken,
      });
      const s3ForcePathStyle = await prompter.confirm({
        message: "Use path-style for S3 endpoint?",
        initialValue: existing.s3ForcePathStyle === true,
      });
      const s3KeyPrefix = await prompter.text({
        message: "S3 key prefix (optional)",
        placeholder: "gewe-openclaw/outbound",
        initialValue: existing.s3KeyPrefix,
      });
      const s3UrlMode = (await prompter.select({
        message: "S3 URL mode",
        options: [
          { value: "public", label: "public (default)" },
          { value: "presigned", label: "presigned" },
        ],
        initialValue: existing.s3UrlMode ?? "public",
      })) as NonNullable<GeweAccountConfig["s3UrlMode"]>;
      const s3PublicBaseUrl =
        s3UrlMode === "public"
          ? await prompter.text({
              message: "S3 public base URL",
              placeholder: "https://cdn.example.com/gewe-media",
              initialValue: existing.s3PublicBaseUrl,
              validate: (value) => (value.trim() ? undefined : "Required"),
            })
          : await prompter.text({
              message: "S3 public base URL (optional in presigned mode)",
              initialValue: existing.s3PublicBaseUrl,
            });
      const s3PresignExpiresSecRaw =
        s3UrlMode === "presigned"
          ? await prompter.text({
              message: "Presigned URL expire seconds",
              initialValue: String(existing.s3PresignExpiresSec ?? 3600),
              validate: (value) => {
                const parsed = Number(value);
                return Number.isInteger(parsed) && parsed > 0
                  ? undefined
                  : "Must be a positive integer";
              },
            })
          : "";

      next = setGeweAccountConfig(next, accountId, {
        s3Enabled: true,
        s3Endpoint: s3Endpoint.trim(),
        s3Region: s3Region.trim(),
        s3Bucket: s3Bucket.trim(),
        s3AccessKeyId: s3AccessKeyId.trim(),
        s3SecretAccessKey: s3SecretAccessKey.trim(),
        s3SessionToken: s3SessionToken.trim() || undefined,
        s3ForcePathStyle,
        s3KeyPrefix: s3KeyPrefix.trim() || undefined,
        s3UrlMode,
        s3PublicBaseUrl: s3PublicBaseUrl.trim() || undefined,
        s3PresignExpiresSec:
          s3UrlMode === "presigned" ? Number(s3PresignExpiresSecRaw) : undefined,
      });
    } else {
      next = setGeweAccountConfig(next, accountId, { s3Enabled: false });
    }

    if (!forceAllowFrom) {
      next = await promptOptionalAllowFrom({
        cfg: next,
        accountId,
        prompter,
      });
    }

    return { cfg: next };
  },
  completionNote: {
    title: "GeWe restart required",
    lines: [
      "Restart the OpenClaw gateway after saving GeWe config.",
      "Make sure your webhook endpoint and optional mediaPublicUrl are publicly reachable.",
    ],
  },
};

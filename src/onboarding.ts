import type { ChannelPlugin, OpenClawConfig, WizardPrompter } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";

import type { CoreConfig, GeweAccountConfig, ResolvedGeweAccount } from "./types.js";
import { resolveGeweAccount, resolveDefaultGeweAccountId, listGeweAccountIds } from "./accounts.js";
import { CHANNEL_CONFIG_KEY, CHANNEL_ID, stripChannelPrefix } from "./constants.js";

const DEFAULT_WEBHOOK_HOST = "0.0.0.0";
const DEFAULT_WEBHOOK_PORT = 4399;
const DEFAULT_WEBHOOK_PATH = "/webhook";
const DEFAULT_MEDIA_HOST = "0.0.0.0";
const DEFAULT_MEDIA_PORT = 4400;
const DEFAULT_MEDIA_PATH = "/gewe-media";
const DEFAULT_API_BASE_URL = "https://www.geweapi.com";

type GeweOnboardingAdapter = NonNullable<
  ChannelPlugin<ResolvedGeweAccount>["onboarding"]
>;

type AccountSelection = {
  accountId: string;
  label: string;
};

function listAccountChoices(cfg: OpenClawConfig): AccountSelection[] {
  const ids = listGeweAccountIds(cfg as CoreConfig);
  return ids.map((accountId) => ({
    accountId,
    label: accountId === DEFAULT_ACCOUNT_ID ? "default (primary)" : accountId,
  }));
}

async function promptAccountId(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  currentId?: string;
}): Promise<string> {
  const choices = listAccountChoices(params.cfg);
  const defaultId = resolveDefaultGeweAccountId(params.cfg as CoreConfig);
  const initial = params.currentId?.trim() || defaultId || DEFAULT_ACCOUNT_ID;
  const selection = await params.prompter.select({
    message: "GeWe account",
    options: [
      ...choices.map((item) => ({ value: item.accountId, label: item.label })),
      { value: "__new__", label: "Add a new account" },
    ],
    initialValue: initial,
  });

  if (selection !== "__new__") {
    return normalizeAccountId(selection) ?? DEFAULT_ACCOUNT_ID;
  }

  const entered = await params.prompter.text({
    message: "New GeWe account id",
    validate: (value) => (value?.trim() ? undefined : "Required"),
  });
  const normalized = normalizeAccountId(String(entered));
  if (String(entered).trim() !== normalized) {
    await params.prompter.note(`Normalized account id to "${normalized}".`, "GeWe account");
  }
  return normalized;
}

function parseAllowFrom(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((entry) => stripChannelPrefix(entry.trim()))
    .filter(Boolean);
}

async function promptAllowFrom(params: {
  prompter: WizardPrompter;
  existing?: Array<string | number>;
  required?: boolean;
}): Promise<string[]> {
  const initial = (params.existing ?? []).map((entry) => String(entry)).join(", ");
  const value = await params.prompter.text({
    message: "Allowlist wxid (comma or newline separated)",
    placeholder: "wxid_xxx, wxid_yyy",
    initialValue: initial || undefined,
    validate: params.required
      ? (input) => (parseAllowFrom(input).length > 0 ? undefined : "Required")
      : undefined,
  });
  return parseAllowFrom(String(value));
}

function applyAccountPatch(
  cfg: OpenClawConfig,
  accountId: string,
  patch: GeweAccountConfig,
): OpenClawConfig {
  const existing = (cfg.channels?.[CHANNEL_CONFIG_KEY] ?? {}) as GeweAccountConfig & {
    accounts?: Record<string, GeweAccountConfig>;
  };
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        [CHANNEL_CONFIG_KEY]: {
          ...existing,
          ...patch,
          enabled: patch.enabled ?? existing.enabled ?? true,
        },
      },
    };
  }

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      [CHANNEL_CONFIG_KEY]: {
        ...existing,
        accounts: {
          ...(existing.accounts ?? {}),
          [accountId]: {
            ...(existing.accounts?.[accountId] ?? {}),
            ...patch,
            enabled:
              patch.enabled ??
              existing.accounts?.[accountId]?.enabled ??
              existing.enabled ??
              true,
          },
        },
      },
    },
  };
}

function readAccountConfig(cfg: OpenClawConfig, accountId: string): GeweAccountConfig {
  const channelCfg = (cfg.channels?.[CHANNEL_CONFIG_KEY] ?? {}) as GeweAccountConfig & {
    accounts?: Record<string, GeweAccountConfig>;
  };
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return channelCfg;
  }
  return channelCfg.accounts?.[accountId] ?? {};
}

export const geweOnboarding: GeweOnboardingAdapter = {
  channel: CHANNEL_ID,
  async getStatus(ctx) {
    const accountId =
      ctx.accountOverrides?.[CHANNEL_ID] ??
      resolveDefaultGeweAccountId(ctx.cfg as CoreConfig);
    const account = resolveGeweAccount({ cfg: ctx.cfg as CoreConfig, accountId });
    const configured = Boolean(account.token?.trim() && account.appId?.trim());
    const label = configured ? "configured" : "not configured";
    const status = `GeWe (${accountId}): ${label}`;
    return {
      channel: CHANNEL_ID,
      configured,
      statusLines: [status],
      selectionHint: label,
      quickstartScore: configured ? 2 : 0,
    };
  },
  async configure(ctx) {
    const accountId = ctx.shouldPromptAccountIds
      ? await promptAccountId({ cfg: ctx.cfg, prompter: ctx.prompter })
      : resolveDefaultGeweAccountId(ctx.cfg as CoreConfig);
    const resolved = resolveGeweAccount({ cfg: ctx.cfg as CoreConfig, accountId });
    const existing = readAccountConfig(ctx.cfg, accountId);

    await ctx.prompter.note(
      [
        "You will need:",
        "- GeWe token + appId",
        "- Public webhook endpoint (FRP or reverse proxy)",
        "- Public media base URL (for sending voice/media)",
      ].join("\n"),
      "GeWe setup",
    );

    const token = await ctx.prompter.text({
      message: "GeWe token",
      initialValue: resolved.tokenSource !== "none" ? resolved.token : existing.token,
      validate: (value) => (value.trim() ? undefined : "Required"),
    });
    const appId = await ctx.prompter.text({
      message: "GeWe appId",
      initialValue: resolved.appIdSource !== "none" ? resolved.appId : existing.appId,
      validate: (value) => (value.trim() ? undefined : "Required"),
    });

    const apiBaseUrl = await ctx.prompter.text({
      message: "GeWe API base URL",
      initialValue: existing.apiBaseUrl ?? DEFAULT_API_BASE_URL,
      validate: (value) => (value.trim() ? undefined : "Required"),
    });

    const webhookHost = await ctx.prompter.text({
      message: "Webhook host",
      initialValue: existing.webhookHost ?? DEFAULT_WEBHOOK_HOST,
      validate: (value) => (value.trim() ? undefined : "Required"),
    });
    const webhookPortRaw = await ctx.prompter.text({
      message: "Webhook port",
      initialValue: String(existing.webhookPort ?? DEFAULT_WEBHOOK_PORT),
      validate: (value) => {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) return "Must be a positive integer";
        return undefined;
      },
    });
    const webhookPath = await ctx.prompter.text({
      message: "Webhook path",
      initialValue: existing.webhookPath ?? DEFAULT_WEBHOOK_PATH,
      validate: (value) => (value.trim() ? undefined : "Required"),
    });

    const mediaPublicUrl = await ctx.prompter.text({
      message: "Media public URL (prefix)",
      placeholder: "https://your-domain/gewe-media",
      initialValue: existing.mediaPublicUrl,
      validate: (value) => (value.trim() ? undefined : "Required"),
    });

    let allowFrom = existing.allowFrom;
    let dmPolicy: GeweAccountConfig["dmPolicy"] | undefined;
    if (ctx.forceAllowFrom) {
      allowFrom = await promptAllowFrom({
        prompter: ctx.prompter,
        existing: existing.allowFrom,
        required: true,
      });
      dmPolicy = "allowlist";
    } else {
      const wantsAllowlist = await ctx.prompter.confirm({
        message: "Set a DM allowlist now? (optional)",
        initialValue: false,
      });
      if (wantsAllowlist) {
        allowFrom = await promptAllowFrom({
          prompter: ctx.prompter,
          existing: existing.allowFrom,
          required: true,
        });
        dmPolicy = "allowlist";
      }
    }

    let nextCfg = applyAccountPatch(ctx.cfg, accountId, {
      enabled: true,
      token: token.trim(),
      appId: appId.trim(),
      apiBaseUrl: apiBaseUrl.trim().replace(/\/$/, ""),
      webhookHost: webhookHost.trim(),
      webhookPort: Number(webhookPortRaw),
      webhookPath: webhookPath.trim(),
      mediaHost: existing.mediaHost ?? DEFAULT_MEDIA_HOST,
      mediaPort: existing.mediaPort ?? DEFAULT_MEDIA_PORT,
      mediaPath: existing.mediaPath ?? DEFAULT_MEDIA_PATH,
      mediaPublicUrl: mediaPublicUrl.trim(),
      ...(allowFrom ? { allowFrom } : {}),
      ...(dmPolicy ? { dmPolicy } : {}),
    });

    return { cfg: nextCfg, accountId };
  },
};

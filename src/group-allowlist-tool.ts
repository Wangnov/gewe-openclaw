import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk";
import { z } from "zod";

import { resolveGeweAccount } from "./accounts.js";
import { ensureGeweWriteSection } from "./config-edit.js";
import { normalizeGeweBindingConversationId, inferCurrentGeweGroupId } from "./group-binding.js";
import { buildJsonSchema, normalizeAccountId, type OpenClawConfig } from "./openclaw-compat.js";
import { shouldExposeGeweAgentTool } from "./tool-visibility.js";
import type { GeweGroupConfig } from "./types.js";

const GeweManageGroupAllowlistSchema = z
  .object({
    mode: z.enum(["inspect", "add", "remove", "replace", "clear"]).optional().default("inspect"),
    groupId: z.string().optional(),
    accountId: z.string().optional(),
    entries: z.array(z.string()).optional(),
  })
  .strict();

const GeweManageGroupAllowlistParameters =
  buildJsonSchema(GeweManageGroupAllowlistSchema) ?? { type: "object" };

function jsonResult(details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }],
    details,
  };
}

function dedupeEntries(values: readonly unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function resolveToolConfig(ctx: OpenClawPluginToolContext, readConfig?: () => OpenClawConfig): OpenClawConfig {
  return (readConfig?.() ?? (ctx.config as OpenClawConfig | undefined) ?? {}) as OpenClawConfig;
}

function resolveGroupId(params: {
  cfg: OpenClawConfig;
  accountId: string;
  ctx: OpenClawPluginToolContext;
  rawGroupId?: string;
}): string {
  const explicit = params.rawGroupId?.trim();
  if (explicit === "*") {
    return "*";
  }
  const normalizedExplicit = normalizeGeweBindingConversationId(explicit);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }
  const inferred = inferCurrentGeweGroupId({
    cfg: params.cfg,
    accountId: params.accountId,
    sessionKey: params.ctx.sessionKey,
  });
  if (!inferred) {
    throw new Error(
      "GeWe group allowlist management requires groupId, or a current GeWe group session that can infer one.",
    );
  }
  return inferred;
}

function readOverrideEntries(accountConfig: Record<string, unknown>, groupId: string): string[] {
  const groups =
    accountConfig.groups && typeof accountConfig.groups === "object" && !Array.isArray(accountConfig.groups)
      ? (accountConfig.groups as Record<string, GeweGroupConfig | undefined>)
      : {};
  const entries = groups[groupId]?.allowFrom ?? [];
  return dedupeEntries(entries);
}

function resolveEffectiveEntries(params: {
  accountConfig: Record<string, unknown>;
  groupId: string;
}): {
  baseEntries: string[];
  overrideEntries: string[];
  effectiveEntries: string[];
} {
  const baseEntries = dedupeEntries((params.accountConfig.groupAllowFrom as unknown[]) ?? []);
  const overrideEntries = readOverrideEntries(params.accountConfig, params.groupId);
  return {
    baseEntries,
    overrideEntries,
    effectiveEntries: dedupeEntries([...baseEntries, ...overrideEntries]),
  };
}

function mutateGroupAllowlist(params: {
  cfg: OpenClawConfig;
  accountId: string;
  groupId: string;
  mode: "add" | "remove" | "replace" | "clear";
  entries: string[];
}) {
  const write = ensureGeweWriteSection({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  const groups =
    write.target.groups && typeof write.target.groups === "object" && !Array.isArray(write.target.groups)
      ? (write.target.groups as Record<string, Record<string, unknown>>)
      : {};
  write.target.groups = groups;
  const current = groups[params.groupId] ?? {};
  const existing = dedupeEntries((current.allowFrom as unknown[]) ?? []);
  let nextEntries = existing;

  if (params.mode === "replace") {
    nextEntries = dedupeEntries(params.entries);
  } else if (params.mode === "clear") {
    nextEntries = [];
  } else {
    const nextSet = new Set(existing);
    for (const entry of params.entries) {
      if (params.mode === "add") {
        nextSet.add(entry);
      } else {
        nextSet.delete(entry);
      }
    }
    nextEntries = Array.from(nextSet);
  }

  const nextGroup = { ...current };
  if (nextEntries.length > 0) {
    nextGroup.allowFrom = nextEntries;
  } else {
    delete nextGroup.allowFrom;
  }
  if (Object.keys(nextGroup).length > 0) {
    groups[params.groupId] = nextGroup;
  } else {
    delete groups[params.groupId];
  }
  if (Object.keys(groups).length === 0) {
    delete write.target.groups;
  }
  return {
    nextCfg: write.nextCfg,
    nextEntries,
    pathLabel: `${write.pathPrefix}.groups.${params.groupId}.allowFrom`,
  };
}

export function createGeweManageGroupAllowlistTool(
  ctx: OpenClawPluginToolContext,
  deps?: {
    readConfig?: () => OpenClawConfig;
    writeConfigFile?: (next: OpenClawConfig) => Promise<void>;
  },
): AnyAgentTool | null {
  if (!shouldExposeGeweAgentTool(ctx)) {
    return null;
  }
  return {
    name: "gewe_manage_group_allowlist",
    label: "GeWe Manage Group Allowlist",
    description:
      "Inspect or edit a GeWe group's allowFrom override. Modes: inspect, add, remove, replace, clear.",
    parameters: GeweManageGroupAllowlistParameters,
    execute: async (_toolCallId, rawParams) => {
      const params = GeweManageGroupAllowlistSchema.parse(rawParams ?? {});
      const cfg = resolveToolConfig(ctx, deps?.readConfig);
      const accountId = normalizeAccountId(params.accountId ?? ctx.agentAccountId ?? "default");
      const groupId = resolveGroupId({
        cfg,
        accountId,
        ctx,
        rawGroupId: params.groupId,
      });
      const resolvedAccount = resolveGeweAccount({
        cfg: cfg as never,
        accountId,
      });
      const accountConfig = (
        accountId === "default"
          ? (cfg.channels?.["gewe-openclaw"] ?? {})
          : ((cfg.channels?.["gewe-openclaw"] as { accounts?: Record<string, unknown> } | undefined)
              ?.accounts?.[accountId] ?? {})
      ) as Record<string, unknown>;

      const current = resolveEffectiveEntries({
        accountConfig: resolvedAccount.config as Record<string, unknown>,
        groupId,
      });

      if (params.mode === "inspect") {
        return jsonResult({
          ok: true,
          mode: params.mode,
          accountId,
          groupId,
          groupPolicy: resolvedAccount.config.groupPolicy ?? "allowlist",
          baseEntries: current.baseEntries,
          overrideEntries: current.overrideEntries,
          effectiveEntries: current.effectiveEntries,
        });
      }

      if (!deps?.writeConfigFile) {
        throw new Error("GeWe group allowlist management requires runtime config write support.");
      }

      const entries = dedupeEntries(params.entries ?? []);
      if (params.mode !== "clear" && entries.length === 0) {
        throw new Error(`GeWe ${params.mode} requires entries.`);
      }

      const mutated = mutateGroupAllowlist({
        cfg,
        accountId,
        groupId,
        mode: params.mode,
        entries,
      });
      await deps.writeConfigFile(mutated.nextCfg);

      return jsonResult({
        ok: true,
        mode: params.mode,
        accountId,
        groupId,
        pathLabel: mutated.pathLabel,
        overrideEntries: mutated.nextEntries,
      });
    },
  };
}

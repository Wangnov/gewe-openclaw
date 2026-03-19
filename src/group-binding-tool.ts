import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk";
import { z } from "zod";

import {
  buildGeweDesiredBindingIdentity,
  getGeweChatroomInfo,
  getGeweProfile,
  inferCurrentGeweGroupId,
  modifyGeweChatroomRemark,
  modifyGeweChatroomSelfNickname,
  normalizeGeweBindingConversationId,
  resolveExplicitGeweGroupBinding,
  resolveGeweAccountForBindingTool,
  resolveGeweAgentDisplayName,
  resolveGeweBindingIdentityConfigForGroup,
  resolveGeweCurrentSelfNickname,
} from "./group-binding.js";
import { buildJsonSchema, normalizeAccountId, type OpenClawConfig } from "./openclaw-compat.js";
import { shouldExposeGeweAgentTool } from "./tool-visibility.js";

const GeweSyncGroupBindingToolSchema = z
  .object({
    mode: z.enum(["inspect", "dry_run", "apply"]).optional().default("inspect"),
    groupId: z.string().optional(),
    accountId: z.string().optional(),
    syncSelfNickname: z.boolean().optional(),
    syncRemark: z.boolean().optional(),
  })
  .strict();

const GeweSyncGroupBindingToolParameters =
  buildJsonSchema(GeweSyncGroupBindingToolSchema) ?? { type: "object" };

function jsonResult(details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }],
    details,
  };
}

export function createGeweSyncGroupBindingTool(ctx: OpenClawPluginToolContext): AnyAgentTool | null {
  if (!shouldExposeGeweAgentTool(ctx)) {
    return null;
  }
  return {
    name: "gewe_sync_group_binding",
    label: "GeWe Sync Group Binding",
    description:
      "Inspect or manually sync a GeWe group binding identity. Modes: inspect, dry_run, apply.",
    parameters: GeweSyncGroupBindingToolParameters,
    execute: async (_toolCallId, rawParams) => {
      const params = GeweSyncGroupBindingToolSchema.parse(rawParams ?? {});
      const cfg = (ctx.config ?? {}) as OpenClawConfig;
      const accountId = normalizeAccountId(params.accountId ?? ctx.agentAccountId ?? "default");
      const explicitGroupId = normalizeGeweBindingConversationId(params.groupId);
      const groupId =
        explicitGroupId ??
        inferCurrentGeweGroupId({
          cfg,
          accountId,
          sessionKey: ctx.sessionKey,
        });
      if (!groupId) {
        throw new Error(
          "GeWe group binding sync requires groupId, or a current GeWe group session that can infer one.",
        );
      }

      const binding = resolveExplicitGeweGroupBinding({
        cfg,
        accountId,
        groupId,
      });
      if (!binding) {
        throw new Error(
          `GeWe group binding sync requires an explicit group binding for "${groupId}" on account "${accountId}".`,
        );
      }

      const account = resolveGeweAccountForBindingTool({ cfg, accountId });
      const identity = resolveGeweBindingIdentityConfigForGroup({
        accountConfig: account.config,
        groupId,
      });
      if (!identity.enabled) {
        throw new Error(`GeWe bindingIdentity is disabled for "${groupId}".`);
      }

      const agentName = resolveGeweAgentDisplayName(cfg, binding.agentId);
      const desired = buildGeweDesiredBindingIdentity({
        identity,
        agentId: binding.agentId,
        agentName,
      });
      const profile = await getGeweProfile({ account });
      const groupInfo = await getGeweChatroomInfo({ account, groupId });
      const current = {
        selfNickname: resolveGeweCurrentSelfNickname(groupInfo, profile.wxid),
        remark: groupInfo.remark?.trim() || null,
      };

      const sync = {
        selfNickname: params.syncSelfNickname ?? true,
        remark: params.syncRemark ?? true,
      };
      const changes = {
        selfNickname:
          sync.selfNickname && (desired.selfNickname ?? null) !== (current.selfNickname ?? null),
        remark: sync.remark && (desired.remark ?? null) !== (current.remark ?? null),
      };
      const applied = {
        selfNickname: false,
        remark: false,
      };

      if (params.mode === "apply") {
        if (changes.selfNickname && desired.selfNickname) {
          await modifyGeweChatroomSelfNickname({
            account,
            groupId,
            nickName: desired.selfNickname,
          });
          applied.selfNickname = true;
        }
        if (changes.remark && desired.remark) {
          await modifyGeweChatroomRemark({
            account,
            groupId,
            remark: desired.remark,
          });
          applied.remark = true;
        }
      }

      return jsonResult({
        ok: true,
        mode: params.mode,
        accountId,
        binding: {
          kind: binding.kind,
          groupId,
          agentId: binding.agentId,
          agentName,
        },
        sync,
        current,
        desired,
        changes,
        applied,
        profile: {
          wxid: profile.wxid,
        },
        chatroom: {
          chatroomId: groupInfo.chatroomId,
          nickName: groupInfo.nickName ?? null,
        },
      });
    },
  };
}

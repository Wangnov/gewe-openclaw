import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk";
import { z } from "zod";

import { normalizeGeweMessagingTarget } from "./normalize.js";
import { buildJsonSchema, normalizeAccountId } from "./openclaw-compat.js";
import { issueGeweGroupClaimCode } from "./pairing-store.js";
import { shouldExposeGeweAgentTool } from "./tool-visibility.js";

const GeweIssueGroupClaimCodeSchema = z
  .object({
    accountId: z.string().optional(),
  })
  .strict();

const GeweIssueGroupClaimCodeParameters =
  buildJsonSchema(GeweIssueGroupClaimCodeSchema) ?? { type: "object" };

function extractSessionScopedTarget(
  sessionKey: string | undefined,
  markers: string[],
): string | undefined {
  const raw = sessionKey?.trim();
  if (!raw) {
    return undefined;
  }
  const lowered = raw.toLowerCase();
  for (const marker of markers) {
    const index = lowered.indexOf(marker);
    if (index === -1) {
      continue;
    }
    const value = raw.slice(index + marker.length).trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function inferCurrentGeweDirectWxid(ctx: OpenClawPluginToolContext): string | undefined {
  const fromSession = extractSessionScopedTarget(ctx.sessionKey, [
    ":gewe-openclaw:direct:",
    ":gewe-openclaw:dm:",
    ":gewe:direct:",
    ":gewe:dm:",
  ]);
  const normalizedSession = normalizeGeweMessagingTarget(fromSession ?? "");
  if (normalizedSession && !normalizedSession.endsWith("@chatroom")) {
    return normalizedSession;
  }

  const normalizedRequester = normalizeGeweMessagingTarget(ctx.requesterSenderId ?? "");
  if (normalizedRequester && !normalizedRequester.endsWith("@chatroom")) {
    return normalizedRequester;
  }
  return undefined;
}

function jsonResult(details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }],
    details,
  };
}

export function createGeweIssueGroupClaimCodeTool(ctx: OpenClawPluginToolContext): AnyAgentTool | null {
  if (!shouldExposeGeweAgentTool(ctx)) {
    return null;
  }
  return {
    name: "gewe_issue_group_claim_code",
    label: "GeWe Issue Group Claim Code",
    description:
      "Issue a short-lived single-use group claim code for the current GeWe direct-message session.",
    parameters: GeweIssueGroupClaimCodeParameters,
    execute: async (_toolCallId, rawParams) => {
      const params = GeweIssueGroupClaimCodeSchema.parse(rawParams ?? {});
      const accountId = normalizeAccountId(params.accountId ?? ctx.agentAccountId ?? "default");
      const issuerId = inferCurrentGeweDirectWxid(ctx);
      if (!issuerId) {
        throw new Error(
          "GeWe group claim code issuance requires a current GeWe direct-message session to infer the owner wxid.",
        );
      }

      const issued = await issueGeweGroupClaimCode({
        accountId,
        issuerId,
      });

      return jsonResult({
        ok: true,
        accountId: issued.accountId,
        issuerId: issued.issuerId,
        code: issued.code,
        recommendedGroupMessage: issued.code,
        createdAt: issued.createdAt,
        expiresAt: issued.expiresAt,
        usageHint: `把机器人拉进目标群后，在群里只发送这 8 位认领码：${issued.code}（不要加“认领码:”前缀）`,
      });
    },
  };
}

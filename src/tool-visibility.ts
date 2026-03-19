import type { OpenClawPluginToolContext } from "openclaw/plugin-sdk";

import { CHANNEL_ALIASES, CHANNEL_ID } from "./constants.js";

const GEWE_DIRECT_SESSION_MARKERS = [
  `:${CHANNEL_ID}:direct:`,
  `:${CHANNEL_ID}:dm:`,
  ":gewe:direct:",
  ":gewe:dm:",
];

export function isCurrentGeweDirectSession(ctx: OpenClawPluginToolContext): boolean {
  const normalizedChannel = (ctx.messageChannel ?? "").trim().toLowerCase();
  if (normalizedChannel && !CHANNEL_ALIASES.includes(normalizedChannel as (typeof CHANNEL_ALIASES)[number])) {
    return false;
  }

  const normalizedSessionKey = (ctx.sessionKey ?? "").trim().toLowerCase();
  if (!normalizedSessionKey) {
    return false;
  }
  return GEWE_DIRECT_SESSION_MARKERS.some((marker) => normalizedSessionKey.includes(marker));
}

export function shouldExposeGeweAgentTool(ctx: OpenClawPluginToolContext): boolean {
  return ctx.senderIsOwner === true || isCurrentGeweDirectSession(ctx);
}

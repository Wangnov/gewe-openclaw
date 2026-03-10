import type { ResolvedGeweAccount } from "./types.js";

export function resolveGeweReplyOptions(account: Pick<ResolvedGeweAccount, "config">): {
  disableBlockStreaming: boolean;
} {
  return {
    disableBlockStreaming: account.config.blockStreaming === false,
  };
}

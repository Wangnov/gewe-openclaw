import type { ResolvedGeweAccount } from "./types.js";

export function resolveGeweReplyOptions(
  account: Pick<ResolvedGeweAccount, "config">,
  opts?: { skillFilter?: string[] },
): {
  disableBlockStreaming: boolean;
  skillFilter?: string[];
} {
  return {
    disableBlockStreaming: account.config.blockStreaming === false,
    ...(opts?.skillFilter ? { skillFilter: opts.skillFilter } : {}),
  };
}

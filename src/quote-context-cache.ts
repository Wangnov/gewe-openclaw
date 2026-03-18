import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "./openclaw-compat.js";
import type { GeweQuotePartialText } from "./xml.js";

const QUOTE_CONTEXT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const QUOTE_CONTEXT_MAX_ENTRIES = 2048;

type GeweQuoteReplyContext = {
  svrid: string;
  partialText: GeweQuotePartialText;
  recordedAt: number;
};

const quoteReplyContextCache = new Map<string, GeweQuoteReplyContext>();

function buildCacheKey(accountId: string | undefined, messageId: string): string {
  return `${normalizeAccountId(accountId || DEFAULT_ACCOUNT_ID)}:${messageId.trim()}`;
}

function normalizePartialText(
  partialText?: GeweQuotePartialText,
): GeweQuotePartialText | undefined {
  if (!partialText) return undefined;
  const normalized = Object.fromEntries(
    Object.entries({
      text: partialText.text?.trim(),
      start: partialText.start?.trim(),
      end: partialText.end?.trim(),
      startIndex:
        typeof partialText.startIndex === "number" ? Math.trunc(partialText.startIndex) : undefined,
      endIndex:
        typeof partialText.endIndex === "number" ? Math.trunc(partialText.endIndex) : undefined,
      quoteMd5: partialText.quoteMd5?.trim().toLowerCase(),
    }).filter(([, value]) => value !== undefined && value !== ""),
  ) as GeweQuotePartialText;

  const hasEnough =
    Boolean(normalized.text) ||
    (Boolean(normalized.start) && Boolean(normalized.end) && Boolean(normalized.quoteMd5));
  return hasEnough ? normalized : undefined;
}

function pruneQuoteReplyContextCache(now = Date.now()): void {
  for (const [key, value] of quoteReplyContextCache.entries()) {
    if (now - value.recordedAt > QUOTE_CONTEXT_TTL_MS) {
      quoteReplyContextCache.delete(key);
    }
  }
  while (quoteReplyContextCache.size > QUOTE_CONTEXT_MAX_ENTRIES) {
    const oldest = quoteReplyContextCache.keys().next();
    if (oldest.done) break;
    quoteReplyContextCache.delete(oldest.value);
  }
}

export function rememberGeweQuoteReplyContext(params: {
  accountId?: string;
  messageId?: string;
  svrid?: string;
  partialText?: GeweQuotePartialText;
}): void {
  const messageId = params.messageId?.trim();
  const svrid = params.svrid?.trim();
  const partialText = normalizePartialText(params.partialText);
  if (!messageId || !svrid || !partialText) {
    return;
  }
  pruneQuoteReplyContextCache();
  quoteReplyContextCache.set(buildCacheKey(params.accountId, messageId), {
    svrid,
    partialText,
    recordedAt: Date.now(),
  });
}

export function recallGeweQuoteReplyContext(params: {
  accountId?: string;
  messageId?: string;
}): { svrid: string; partialText: GeweQuotePartialText } | null {
  const messageId = params.messageId?.trim();
  if (!messageId) {
    return null;
  }
  const now = Date.now();
  pruneQuoteReplyContextCache(now);
  const cached = quoteReplyContextCache.get(buildCacheKey(params.accountId, messageId));
  if (!cached) {
    return null;
  }
  if (now - cached.recordedAt > QUOTE_CONTEXT_TTL_MS) {
    quoteReplyContextCache.delete(buildCacheKey(params.accountId, messageId));
    return null;
  }
  return {
    svrid: cached.svrid,
    partialText: cached.partialText,
  };
}

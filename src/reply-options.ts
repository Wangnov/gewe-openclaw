import type { ReplyPayload } from "./openclaw-compat.js";
import type {
  GeweDmReplyMode,
  ResolvedGeweAccount,
  ResolvedGeweGroupReplyMode,
} from "./types.js";

const CHANNEL_DATA_KEY = "gewe-openclaw";

type GeweReplyMode = ResolvedGeweGroupReplyMode | GeweDmReplyMode;
type RepliedRef = { value: boolean };

function canAttachAt(payload: ReplyPayload): boolean {
  return typeof payload.text === "string" && payload.text.trim().length > 0 && !payload.mediaUrl;
}

function withReplyToId(
  payload: ReplyPayload,
  replyToId: string | undefined,
  repliedRef: RepliedRef | undefined,
): ReplyPayload {
  const explicitReplyToId = payload.replyToId?.trim();
  if (explicitReplyToId) {
    if (repliedRef) repliedRef.value = true;
    return payload;
  }
  const trimmedReplyToId = replyToId?.trim();
  if (!trimmedReplyToId || repliedRef?.value) {
    return payload;
  }
  if (repliedRef) repliedRef.value = true;
  return {
    ...payload,
    replyToId: trimmedReplyToId,
  };
}

function withAtSender(payload: ReplyPayload, senderId: string | undefined): ReplyPayload {
  const trimmedSenderId = senderId?.trim();
  if (!trimmedSenderId || !canAttachAt(payload)) {
    return payload;
  }
  const channelData =
    payload.channelData && typeof payload.channelData === "object" ? payload.channelData : {};
  const existingScope =
    CHANNEL_DATA_KEY in channelData &&
    channelData[CHANNEL_DATA_KEY] &&
    typeof channelData[CHANNEL_DATA_KEY] === "object"
      ? (channelData[CHANNEL_DATA_KEY] as Record<string, unknown>)
      : {};
  const existingAt = typeof existingScope.ats === "string" ? existingScope.ats.trim() : "";
  if (existingAt) {
    return payload;
  }
  return {
    ...payload,
    channelData: {
      ...channelData,
      [CHANNEL_DATA_KEY]: {
        ...existingScope,
        ats: trimmedSenderId,
      },
    },
  };
}

function withAtSenderPrefix(payload: ReplyPayload, senderName: string | undefined): ReplyPayload {
  const trimmedSenderName = senderName?.trim();
  const trimmedText = payload.text?.trim();
  if (!trimmedSenderName || !trimmedText) {
    return payload;
  }

  const mentionPrefix = `@${trimmedSenderName}`;
  if (trimmedText === mentionPrefix || trimmedText.startsWith(`${mentionPrefix} `) || trimmedText.startsWith(`${mentionPrefix}\u2005`)) {
    return payload;
  }

  return {
    ...payload,
    text: `${mentionPrefix}\u2005${trimmedText}`,
  };
}

function withoutDefaultReplyToId(
  payload: ReplyPayload,
  defaultReplyToId: string | undefined,
): ReplyPayload {
  const explicitReplyToId = payload.replyToId?.trim();
  const trimmedDefaultReplyToId = defaultReplyToId?.trim();
  if (!explicitReplyToId || !trimmedDefaultReplyToId || explicitReplyToId !== trimmedDefaultReplyToId) {
    return payload;
  }

  const { replyToId: _ignored, ...rest } = payload;
  return rest;
}

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

export function applyGeweReplyModeToPayload(
  payload: ReplyPayload,
  params: {
    mode: GeweReplyMode;
    isGroup: boolean;
    senderId?: string;
    senderName?: string;
    defaultReplyToId?: string;
    repliedRef?: RepliedRef;
  },
): ReplyPayload {
  let nextPayload = payload;
  const effectiveMode =
    params.mode === "quote_and_at_compat" && !canAttachAt(payload) ? "quote_source" : params.mode;

  if (effectiveMode === "quote_source" || effectiveMode === "quote_and_at_compat") {
    nextPayload = withReplyToId(nextPayload, params.defaultReplyToId, params.repliedRef);
  } else if (nextPayload.replyToId?.trim() && params.repliedRef) {
    params.repliedRef.value = true;
  }

  if (effectiveMode === "plain" || effectiveMode === "at_sender") {
    nextPayload = withoutDefaultReplyToId(nextPayload, params.defaultReplyToId);
  }

  if (
    params.isGroup &&
    (effectiveMode === "at_sender" || effectiveMode === "quote_and_at_compat")
  ) {
    nextPayload = withAtSenderPrefix(nextPayload, params.senderName);
    if (effectiveMode === "at_sender") {
      nextPayload = withAtSender(nextPayload, params.senderId);
    }
  }

  return nextPayload;
}

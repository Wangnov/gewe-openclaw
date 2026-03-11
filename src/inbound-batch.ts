import type { AgentMediaPayload, OpenClawConfig } from "openclaw/plugin-sdk";
import { buildAgentMediaPayload } from "openclaw/plugin-sdk";

import type { GeweInboundMessage } from "./types.js";

const CHANNEL_ID = "gewe-openclaw" as const;
const DEFAULT_GEWE_INBOUND_DEBOUNCE_MS = 1000;

type DebounceBuffer = {
  messages: GeweInboundMessage[];
  timeout: ReturnType<typeof setTimeout> | null;
  debounceMs: number;
};

function normalizeMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.trunc(value));
}

function resolveGroupConversationId(message: GeweInboundMessage): string | undefined {
  if (message.fromId.endsWith("@chatroom")) {
    return message.fromId;
  }
  if (message.toId.endsWith("@chatroom")) {
    return message.toId;
  }
  return undefined;
}

export function resolveGeweInboundDebounceMs(cfg: OpenClawConfig): number {
  const inbound = cfg.messages?.inbound;
  const byChannel = normalizeMs(inbound?.byChannel?.[CHANNEL_ID]);
  const global = normalizeMs(inbound?.debounceMs);
  return byChannel ?? global ?? DEFAULT_GEWE_INBOUND_DEBOUNCE_MS;
}

export function buildGeweInboundDebounceKey(params: {
  accountId: string;
  message: GeweInboundMessage;
}): string | null {
  const conversationId = params.message.isGroupChat
    ? resolveGroupConversationId(params.message)
    : params.message.senderId || params.message.fromId || params.message.toId;
  const senderId = params.message.senderId?.trim();
  const accountId = params.accountId.trim();
  if (!accountId || !conversationId || !senderId) {
    return null;
  }
  return `${CHANNEL_ID}:${accountId}:${conversationId}:${senderId}`;
}

export function resolveGeweInboundDebounceText(message: GeweInboundMessage): string {
  const text = message.text?.trim() ?? "";
  if (text) {
    return text;
  }
  if (message.msgType === 3) return "<media:image>";
  if (message.msgType === 34) return "<media:audio>";
  if (message.msgType === 43) return "<media:video>";
  if (message.msgType === 49) return "<media:document>";
  return "";
}

export function buildGeweInboundMessageMeta(messages: GeweInboundMessage[]): {
  messageSid?: string;
  messageSidFull?: string;
  messageSids?: string[];
  messageSidFirst?: string;
  messageSidLast?: string;
  timestamp?: number;
} {
  const ids = messages
    .map((message) => message.newMessageId?.trim() || message.messageId?.trim())
    .filter(Boolean) as string[];
  const lastMessage = messages.at(-1);
  const firstId = ids[0];
  const lastId = ids.at(-1);

  return {
    messageSid: lastId,
    messageSidFull: lastId,
    messageSids: ids.length > 1 ? ids : undefined,
    messageSidFirst: ids.length > 1 ? firstId : undefined,
    messageSidLast: ids.length > 1 ? lastId : undefined,
    timestamp: lastMessage?.timestamp,
  };
}

export function buildGeweInboundMediaPayload(
  mediaList: Array<{ path: string; contentType?: string | null }>,
): AgentMediaPayload {
  if (mediaList.length === 0) {
    return {};
  }
  return buildAgentMediaPayload(mediaList);
}

export function createGeweInboundDebouncer(params: {
  cfg: OpenClawConfig;
  accountId: string;
  isControlCommand: (text: string) => boolean;
  onFlush: (messages: GeweInboundMessage[]) => Promise<void>;
  onError?: (err: unknown, messages: GeweInboundMessage[]) => void;
}) {
  const buffers = new Map<string, DebounceBuffer>();

  const flushBuffer = async (key: string, buffer: DebounceBuffer) => {
    buffers.delete(key);
    if (buffer.timeout) {
      clearTimeout(buffer.timeout);
      buffer.timeout = null;
    }
    if (buffer.messages.length === 0) {
      return;
    }
    try {
      await params.onFlush(buffer.messages);
    } catch (err) {
      params.onError?.(err, buffer.messages);
    }
  };

  const flushKey = async (key: string) => {
    const buffer = buffers.get(key);
    if (!buffer) {
      return;
    }
    await flushBuffer(key, buffer);
  };

  const scheduleFlush = (key: string, buffer: DebounceBuffer) => {
    if (buffer.timeout) {
      clearTimeout(buffer.timeout);
    }
    buffer.timeout = setTimeout(() => {
      void flushBuffer(key, buffer);
    }, buffer.debounceMs);
    buffer.timeout.unref?.();
  };

  const enqueue = async (message: GeweInboundMessage) => {
    const key = buildGeweInboundDebounceKey({
      accountId: params.accountId,
      message,
    });
    const debounceMs = resolveGeweInboundDebounceMs(params.cfg);
    const canDebounce =
      debounceMs > 0 && !params.isControlCommand(resolveGeweInboundDebounceText(message));

    if (!canDebounce || !key) {
      if (key && buffers.has(key)) {
        await flushKey(key);
      }
      try {
        await params.onFlush([message]);
      } catch (err) {
        params.onError?.(err, [message]);
      }
      return;
    }

    const existing = buffers.get(key);
    if (existing) {
      existing.messages.push(message);
      existing.debounceMs = debounceMs;
      scheduleFlush(key, existing);
      return;
    }

    const buffer: DebounceBuffer = {
      messages: [message],
      timeout: null,
      debounceMs,
    };
    buffers.set(key, buffer);
    scheduleFlush(key, buffer);
  };

  const flushAll = async () => {
    for (const [key, buffer] of [...buffers.entries()]) {
      await flushBuffer(key, buffer);
    }
  };

  return { enqueue, flushKey, flushAll };
}

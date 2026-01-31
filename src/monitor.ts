import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { RuntimeEnv } from "openclaw/plugin-sdk";

import { resolveGeweAccount } from "./accounts.js";
import { GeweDownloadQueue } from "./download-queue.js";
import { handleGeweInbound } from "./inbound.js";
import { createGeweMediaServer, DEFAULT_MEDIA_HOST, DEFAULT_MEDIA_PATH, DEFAULT_MEDIA_PORT } from "./media-server.js";
import { getGeweRuntime } from "./runtime.js";
import type {
  CoreConfig,
  GeweCallbackPayload,
  GeweInboundMessage,
  GeweWebhookServerOptions,
  ResolvedGeweAccount,
} from "./types.js";

const DEFAULT_WEBHOOK_PORT = 4399;
const DEFAULT_WEBHOOK_HOST = "0.0.0.0";
const DEFAULT_WEBHOOK_PATH = "/webhook";
const HEALTH_PATH = "/healthz";
const DEDUPE_TTL_MS = 12 * 60 * 60 * 1000;

const SEEN_MESSAGES = new Map<string, number>();

function cleanupSeen() {
  const now = Date.now();
  for (const [key, ts] of SEEN_MESSAGES.entries()) {
    if (now - ts > DEDUPE_TTL_MS) {
      SEEN_MESSAGES.delete(key);
    }
  }
}

function isDuplicate(key: string): boolean {
  cleanupSeen();
  if (SEEN_MESSAGES.has(key)) return true;
  SEEN_MESSAGES.set(key, Date.now());
  return false;
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : JSON.stringify(err);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function resolveWebhookToken(req: IncomingMessage): string | undefined {
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const candidates = [
    headers["x-gewe-callback-token"],
    headers["x-webhook-token"],
    headers["x-gewe-token"],
  ];
  for (const value of candidates) {
    if (!value) continue;
    if (Array.isArray(value)) {
      const first = value[0]?.trim();
      if (first) return first;
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function validateWebhookSecret(
  req: IncomingMessage,
  path: string,
  secret?: string,
): { ok: boolean; reason?: string } {
  if (!secret) return { ok: true };
  const headerToken = resolveWebhookToken(req);
  if (headerToken && headerToken === secret) return { ok: true };
  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host || "localhost"}`);
    const token = url.searchParams.get("token");
    if (token && token === secret) return { ok: true };
  } catch {
    // ignore URL parse errors
  }
  return {
    ok: false,
    reason: `Missing or invalid webhook token for ${path}`,
  };
}

function splitGroupContent(raw: string): { senderId?: string; body: string } {
  const marker = ":\n";
  const index = raw.indexOf(marker);
  if (index > 0) {
    const sender = raw.slice(0, index).trim();
    const body = raw.slice(index + marker.length);
    if (sender) return { senderId: sender, body };
  }
  return { body: raw };
}

function resolveSenderName(pushContent?: string): string | undefined {
  const value = pushContent?.trim();
  if (!value) return undefined;
  const index = value.indexOf(" : ");
  if (index > 0) {
    return value.slice(0, index).trim() || undefined;
  }
  const altIndex = value.indexOf(": ");
  if (altIndex > 0) {
    return value.slice(0, altIndex).trim() || undefined;
  }
  return undefined;
}

function parseWebhookPayload(body: string): GeweCallbackPayload | null {
  try {
    const data = JSON.parse(body);
    return data as GeweCallbackPayload;
  } catch {
    return null;
  }
}

function payloadToInboundMessage(payload: GeweCallbackPayload): GeweInboundMessage | null {
  const appId = payload.Appid?.trim() ?? "";
  const botWxid = payload.Wxid?.trim() ?? "";
  const data = payload.Data;
  if (!data || !appId || !botWxid) return null;

  const fromId = data.FromUserName?.string?.trim() ?? "";
  const toId = data.ToUserName?.string?.trim() ?? "";
  const msgType = typeof data.MsgType === "number" ? data.MsgType : -1;
  const content = data.Content?.string ?? "";
  const msgId = data.MsgId ?? data.NewMsgId ?? 0;
  const newMsgId = data.NewMsgId ?? data.MsgId ?? 0;
  const createTime = data.CreateTime ?? 0;
  const timestamp = createTime ? createTime * 1000 : Date.now();
  if (!fromId || !toId || msgType < 0) return null;

  const isGroupChat = fromId.endsWith("@chatroom") || toId.endsWith("@chatroom");
  const groupParsed = isGroupChat ? splitGroupContent(content) : { body: content };
  const senderId = (isGroupChat ? groupParsed.senderId : fromId) ?? fromId;
  const text = groupParsed.body?.trim() ?? "";

  return {
    messageId: String(msgId),
    newMessageId: String(newMsgId),
    appId,
    botWxid,
    fromId,
    toId,
    senderId,
    senderName: resolveSenderName(data.PushContent),
    text,
    msgType,
    xml: text,
    timestamp,
    isGroupChat,
  };
}

export function createGeweWebhookServer(opts: GeweWebhookServerOptions): {
  server: Server;
  start: () => Promise<void>;
  stop: () => void;
} {
  const { port, host, path, secret, onMessage, onError, abortSignal } = opts;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === HEALTH_PATH) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    if (req.url?.split("?")[0] !== path || req.method !== "POST") {
      res.writeHead(404);
      res.end();
      return;
    }

    const auth = validateWebhookSecret(req, path, secret);
    if (!auth.ok) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: auth.reason || "Unauthorized" }));
      return;
    }

    try {
      const body = await readBody(req);
      const payload = parseWebhookPayload(body);
      if (!payload) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON payload" }));
        return;
      }
      const message = payloadToInboundMessage(payload);
      if (!message) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid webhook payload" }));
        return;
      }

      res.writeHead(200);
      res.end();

      try {
        await onMessage(message);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(formatError(err)));
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(formatError(err));
      onError?.(error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

  const start = (): Promise<void> => {
    return new Promise((resolve) => {
      server.listen(port, host, () => resolve());
    });
  };

  const stop = () => {
    server.close();
  };

  if (abortSignal) {
    abortSignal.addEventListener("abort", stop, { once: true });
  }

  return { server, start, stop };
}

export type GeweMonitorOptions = {
  accountId?: string;
  account?: ResolvedGeweAccount;
  config?: CoreConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

export async function monitorGeweProvider(
  opts: GeweMonitorOptions,
): Promise<{ stop: () => void }> {
  const core = getGeweRuntime();
  const cfg = opts.config ?? (core.config.loadConfig() as CoreConfig);
  const account = opts.account ?? resolveGeweAccount({ cfg, accountId: opts.accountId });
  const runtime: RuntimeEnv = opts.runtime ?? {
    log: (message: string) => core.logging.getChildLogger().info(message),
    error: (message: string) => core.logging.getChildLogger().error(message),
    exit: () => {
      throw new Error("Runtime exit not available");
    },
  };

  if (!account.token || !account.appId) {
    throw new Error(`GeWe not configured for account "${account.accountId}" (token/appId missing)`);
  }

  const port = account.config.webhookPort ?? DEFAULT_WEBHOOK_PORT;
  const host = account.config.webhookHost ?? DEFAULT_WEBHOOK_HOST;
  const rawPath = account.config.webhookPath?.trim() || DEFAULT_WEBHOOK_PATH;
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const secret = account.config.webhookSecret?.trim() || undefined;

  const downloadQueue = new GeweDownloadQueue({
    minDelayMs: account.config.downloadMinDelayMs,
    maxDelayMs: account.config.downloadMaxDelayMs,
  });

  const webhookServer = createGeweWebhookServer({
    port,
    host,
    path,
    secret,
    onMessage: async (message) => {
      const isSelf = message.fromId === message.botWxid || message.senderId === message.botWxid;
      if (isSelf) return;

      const dedupeKey = `${message.appId}:${message.newMessageId}`;
      if (isDuplicate(dedupeKey)) return;

      await handleGeweInbound({
        message,
        account,
        config: cfg,
        runtime,
        downloadQueue,
        statusSink: opts.statusSink,
      });
    },
    onError: (err) => runtime.error?.(`gewe webhook error: ${String(err)}`),
    abortSignal: opts.abortSignal,
  });

  await webhookServer.start();
  runtime.log?.(`[${account.accountId}] GeWe webhook server listening on ${host}:${port}${path}`);

  let mediaStop: (() => void) | undefined;
  const shouldStartMedia =
    Boolean(account.config.mediaPublicUrl) ||
    Boolean(account.config.mediaPort || account.config.mediaHost || account.config.mediaPath);

  if (shouldStartMedia) {
    const mediaServer = createGeweMediaServer({
      host: account.config.mediaHost ?? DEFAULT_MEDIA_HOST,
      port: account.config.mediaPort ?? DEFAULT_MEDIA_PORT,
      path: account.config.mediaPath ?? DEFAULT_MEDIA_PATH,
      abortSignal: opts.abortSignal,
    });
    await mediaServer.start();
    mediaStop = mediaServer.stop;
    runtime.log?.(
      `[${account.accountId}] GeWe media server listening on ${account.config.mediaHost ?? DEFAULT_MEDIA_HOST}:${account.config.mediaPort ?? DEFAULT_MEDIA_PORT}${account.config.mediaPath ?? DEFAULT_MEDIA_PATH}`,
    );
  }

  let resolveRunning: (() => void) | undefined;
  const runningPromise = new Promise<void>((resolve) => {
    resolveRunning = resolve;
    if (!opts.abortSignal) return;
    if (opts.abortSignal.aborted) {
      resolve();
      return;
    }
    opts.abortSignal.addEventListener("abort", () => resolve(), { once: true });
  });

  const stop = () => {
    webhookServer.stop();
    if (mediaStop) mediaStop();
    resolveRunning?.();
  };

  await runningPromise;

  return { stop };
}

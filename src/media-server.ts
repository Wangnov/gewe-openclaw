import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";

import { detectMime } from "./openclaw-compat.js";
import { resolveOpenClawStateDir } from "./state-paths.js";

export const DEFAULT_MEDIA_HOST = "0.0.0.0";
export const DEFAULT_MEDIA_PORT = 18787;
export const DEFAULT_MEDIA_PATH = "/gewe-media";

export function normalizeMediaPath(value: string): string {
  const trimmed = value.trim() || "/";
  if (trimmed === "/") return "/";
  return trimmed.startsWith("/") ? trimmed.replace(/\/+$/, "") : `/${trimmed.replace(/\/+$/, "")}`;
}

function resolveMediaDir() {
  return path.join(resolveOpenClawStateDir(), "media");
}

function resolveBaseUrl(req: IncomingMessage): string {
  const host = req.headers.host || "localhost";
  return `http://${host}`;
}

function isSafeMediaId(id: string): boolean {
  if (!id) return false;
  if (id.includes("..")) return false;
  return !id.includes("/") && !id.includes("\\");
}

export type GeweMediaServerOptions = {
  host?: string;
  port?: number;
  path?: string;
  abortSignal?: AbortSignal;
};

export async function maybeHandleGeweMediaRequest(params: {
  req: IncomingMessage;
  res: ServerResponse;
  path?: string;
  mediaBaseDir?: string;
}): Promise<boolean> {
  if (!params.req.url) {
    return false;
  }

  const basePath = normalizeMediaPath(params.path ?? DEFAULT_MEDIA_PATH);
  const url = new URL(params.req.url, resolveBaseUrl(params.req));
  if (!url.pathname.startsWith(`${basePath}/`)) {
    return false;
  }

  if (params.req.method !== "GET" && params.req.method !== "HEAD") {
    params.res.writeHead(405);
    params.res.end();
    return true;
  }

  const id = decodeURIComponent(url.pathname.slice(basePath.length + 1));
  if (!isSafeMediaId(id)) {
    params.res.writeHead(400);
    params.res.end();
    return true;
  }

  const mediaBaseDir = params.mediaBaseDir ?? path.join(resolveMediaDir(), "outbound");
  const filePath = path.join(mediaBaseDir, id);
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    params.res.writeHead(404);
    params.res.end();
    return true;
  }

  const contentType = await detectMime({ filePath }).catch(() => undefined);
  const headers: Record<string, string> = {
    "Content-Length": String(stat.size),
    "Cache-Control": "private, max-age=60",
  };
  if (contentType) headers["Content-Type"] = contentType;

  params.res.writeHead(200, headers);
  if (params.req.method === "HEAD") {
    params.res.end();
    return true;
  }

  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!params.res.headersSent) params.res.writeHead(500);
    params.res.end();
  });
  stream.pipe(params.res);
  return true;
}

export function createGeweMediaServer(
  opts: GeweMediaServerOptions,
): { server: Server; start: () => Promise<void>; stop: () => void } {
  const host = opts.host ?? DEFAULT_MEDIA_HOST;
  const port = opts.port ?? DEFAULT_MEDIA_PORT;
  const mediaBaseDir = path.join(resolveMediaDir(), "outbound");

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const handled = await maybeHandleGeweMediaRequest({
      req,
      res,
      path: opts.path,
      mediaBaseDir,
    });
    if (handled) return;
    res.writeHead(404);
    res.end();
  });

  const start = (): Promise<void> =>
    new Promise((resolve) => {
      server.listen(port, host, () => resolve());
    });

  const stop = () => {
    server.close();
  };

  if (opts.abortSignal) {
    opts.abortSignal.addEventListener("abort", stop, { once: true });
  }

  return { server, start, stop };
}

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";

import { detectMime } from "openclaw/plugin-sdk";
import { resolveOpenClawStateDir } from "./state-paths.js";

export const DEFAULT_MEDIA_HOST = "0.0.0.0";
export const DEFAULT_MEDIA_PORT = 18787;
export const DEFAULT_MEDIA_PATH = "/gewe-media";

function normalizePath(value: string): string {
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

export function createGeweMediaServer(
  opts: GeweMediaServerOptions,
): { server: Server; start: () => Promise<void>; stop: () => void } {
  const host = opts.host ?? DEFAULT_MEDIA_HOST;
  const port = opts.port ?? DEFAULT_MEDIA_PORT;
  const basePath = normalizePath(opts.path ?? DEFAULT_MEDIA_PATH);
  const mediaBaseDir = path.join(resolveMediaDir(), "outbound");

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }

    const url = new URL(req.url, resolveBaseUrl(req));
    if (!url.pathname.startsWith(`${basePath}/`)) {
      res.writeHead(404);
      res.end();
      return;
    }

    const id = decodeURIComponent(url.pathname.slice(basePath.length + 1));
    if (!isSafeMediaId(id)) {
      res.writeHead(400);
      res.end();
      return;
    }

    const filePath = path.join(mediaBaseDir, id);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }

    const contentType = await detectMime({ filePath }).catch(() => undefined);
    const headers: Record<string, string> = {
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=60",
    };
    if (contentType) headers["Content-Type"] = contentType;

    res.writeHead(200, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const stream = createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
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

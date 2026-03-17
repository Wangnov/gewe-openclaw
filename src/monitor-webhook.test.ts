import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { createGeweWebhookServer } from "./monitor.ts";

class MockResponse extends PassThrough {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = "";
  headersSent = false;

  writeHead(statusCode: number, headers?: Record<string, string>) {
    this.statusCode = statusCode;
    if (headers) {
      this.headers = { ...this.headers, ...headers };
    }
    this.headersSent = true;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }

  override end(chunk?: unknown, encoding?: BufferEncoding | (() => void), cb?: () => void) {
    if (typeof chunk === "string" || Buffer.isBuffer(chunk)) {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
    }
    this.headersSent = true;
    if (typeof encoding === "function") {
      return super.end(chunk, encoding);
    }
    if (encoding) {
      return super.end(chunk, encoding, cb);
    }
    return super.end(chunk, cb);
  }
}

function createRequest(params: {
  method: string;
  url: string;
  headers?: Record<string, string>;
}): PassThrough & {
  method: string;
  url: string;
  headers: Record<string, string>;
  socket: { remoteAddress: string };
} {
  const req = new PassThrough() as PassThrough & {
    method: string;
    url: string;
    headers: Record<string, string>;
    socket: { remoteAddress: string };
  };
  req.method = params.method;
  req.url = params.url;
  req.headers = params.headers ?? {};
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}

test("GeWe webhook 会拒绝超出宿主限制的请求体", async () => {
  let received = false;
  const { server } = createGeweWebhookServer({
    port: 0,
    host: "127.0.0.1",
    path: "/webhook",
    onMessage: async () => {
      received = true;
    },
  });

  const handler = server.listeners("request")[0];
  assert.equal(typeof handler, "function");

  const req = createRequest({
    method: "POST",
    url: "/webhook",
    headers: {
      "content-type": "application/json",
      "content-length": String(1024 * 1024 + 1),
    },
  });
  const res = new MockResponse();

  await handler(req as never, res as never);

  assert.equal(res.statusCode, 413);
  assert.match(res.body, /Payload too large/i);
  assert.equal(received, false);
});

test("GeWe webhook start 在 listen 失败时会 reject", async () => {
  const { server, start } = createGeweWebhookServer({
    port: 4399,
    host: "127.0.0.1",
    path: "/webhook",
    onMessage: async () => {},
  });

  server.on("error", () => {});
  server.listen = ((...args: unknown[]) => {
    queueMicrotask(() => {
      server.emit("error", new Error("listen failed"));
    });
    return server;
  }) as typeof server.listen;

  const outcome = await Promise.race([
    start()
      .then(() => ({ status: "resolved" as const }))
      .catch((err: unknown) => ({
        status: "rejected" as const,
        message: err instanceof Error ? err.message : String(err),
      })),
    new Promise<{ status: "timeout" }>((resolve) => {
      setTimeout(() => resolve({ status: "timeout" }), 50);
    }),
  ]);

  assert.deepEqual(outcome, {
    status: "rejected",
    message: "listen failed",
  });
});

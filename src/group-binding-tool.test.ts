import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import plugin from "../index.ts";

type RegisteredTool = {
  tool: unknown;
  opts?: { name?: string };
};

function normalizeAgentId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "main";
  }
  return (
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "")
      .slice(0, 64) || "main"
  );
}

function buildConfiguredAcpSessionKey(params: {
  channel: string;
  accountId: string;
  conversationId: string;
  agentId: string;
}) {
  const hash = createHash("sha256")
    .update(`${params.channel}:${params.accountId}:${params.conversationId}`)
    .digest("hex")
    .slice(0, 16);
  return `agent:${normalizeAgentId(params.agentId)}:acp:binding:${params.channel}:${params.accountId}:${hash}`;
}

function createApi(config: Record<string, unknown>) {
  const registeredTools: RegisteredTool[] = [];
  return {
    registeredTools,
    api: {
      id: "gewe-openclaw",
      name: "GeWe",
      source: "/tmp/gewe-openclaw",
      description: "test",
      config,
      runtime: {
        channel: {
          routing: {
            resolveAgentRoute: () => ({
              agentId: "ops",
              accountId: "work",
              sessionKey: "agent:ops:gewe-openclaw:group:34757816141@chatroom",
              mainSessionKey: "agent:ops:main",
              lastRoutePolicy: "session",
              matchedBy: "binding.peer",
            }),
          },
        },
      },
      logger: {
        info() {},
        warn() {},
        error() {},
        debug() {},
      },
      registerChannel() {},
      registerTool(tool: unknown, opts?: { name?: string }) {
        registeredTools.push({ tool, opts });
      },
      registerHook() {},
      registerHttpHandler() {},
      registerHttpRoute() {},
      registerGatewayMethod() {},
      registerCli() {},
      registerService() {},
      registerProvider() {},
      registerCommand() {},
      resolvePath(input: string) {
        return input;
      },
      on() {},
    },
  };
}

function toToolList(value: unknown): Array<Record<string, unknown>> {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [value as Record<string, unknown>];
}

function resolveRegisteredTool(params: {
  registeredTools: RegisteredTool[];
  name: string;
  ctx: Record<string, unknown>;
}) {
  for (const entry of params.registeredTools) {
    if (typeof entry.tool === "function") {
      const built = toToolList((entry.tool as (ctx: Record<string, unknown>) => unknown)(params.ctx));
      const hit = built.find((tool) => tool.name === params.name);
      if (hit) {
        return hit;
      }
      continue;
    }
    if ((entry.tool as Record<string, unknown>).name === params.name) {
      return entry.tool as Record<string, unknown>;
    }
  }
  throw new Error(`tool not registered: ${params.name}`);
}

async function withMockFetch<T>(
  responder: (url: string, init?: RequestInit) => Promise<Response>,
  fn: (calls: Array<{ url: string; init?: RequestInit }>) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return await responder(url, init);
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("GeWe 插件会注册 owner-only 的群绑定同步工具", () => {
  const { api, registeredTools } = createApi({});
  plugin.register?.(api as never);

  const tool = resolveRegisteredTool({
    registeredTools,
    name: "gewe_sync_group_binding",
    ctx: {
      config: {},
      senderIsOwner: true,
    },
  });

  assert.equal(tool.name, "gewe_sync_group_binding");
  assert.equal(tool.ownerOnly, true);
});

test("GeWe 群绑定同步工具会从当前群 session 推断 inspect 目标", async () => {
  const config = {
    agents: {
      list: [{ id: "ops", name: "Ops Agent" }],
    },
    bindings: [
      {
        agentId: "ops",
        match: {
          channel: "gewe-openclaw",
          accountId: "work",
          peer: {
            kind: "group",
            id: "34757816141@chatroom",
          },
        },
      },
    ],
    channels: {
      "gewe-openclaw": {
        accounts: {
          work: {
            token: "token",
            appId: "app-id",
            groups: {
              "34757816141@chatroom": {
                bindingIdentity: {
                  selfNickname: { source: "agent_name" },
                  remark: { source: "agent_id" },
                },
              },
            },
          },
        },
      },
    },
  };
  const { api, registeredTools } = createApi(config);
  plugin.register?.(api as never);
  const tool = resolveRegisteredTool({
    registeredTools,
    name: "gewe_sync_group_binding",
    ctx: {
      config,
      senderIsOwner: true,
      agentAccountId: "work",
      messageChannel: "gewe-openclaw",
      sessionKey: "agent:ops:gewe-openclaw:group:34757816141@chatroom",
    },
  });

  await withMockFetch(
    async (url) => {
      if (url.endsWith("/gewe/v2/api/personal/getProfile")) {
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: {
              wxid: "wxid_bot",
              nickName: "Bot",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/gewe/v2/api/group/getChatroomInfo")) {
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: {
              chatroomId: "34757816141@chatroom",
              nickName: "运维群",
              remark: "legacy-remark",
              memberList: [{ wxid: "wxid_bot", nickName: "Bot", displayName: "Legacy Bot" }],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    },
    async () => {
      const result = await (tool.execute as Function)("call-1", { mode: "inspect" });
      assert.equal(result.details.ok, true);
      assert.equal(result.details.mode, "inspect");
      assert.equal(result.details.binding.kind, "route");
      assert.equal(result.details.binding.groupId, "34757816141@chatroom");
      assert.equal(result.details.binding.agentId, "ops");
      assert.equal(result.details.desired.selfNickname, "Ops Agent");
      assert.equal(result.details.desired.remark, "ops");
      assert.equal(result.details.current.selfNickname, "Legacy Bot");
      assert.equal(result.details.current.remark, "legacy-remark");
    },
  );
});

test("GeWe 群绑定同步工具会在 ACP 绑定场景下只应用发生变化的字段", async () => {
  const config = {
    agents: {
      list: [{ id: "ops", name: "Ops Agent" }],
    },
    bindings: [
      {
        type: "acp",
        agentId: "ops",
        match: {
          channel: "gewe-openclaw",
          accountId: "work",
          peer: {
            kind: "group",
            id: "34757816141@chatroom",
          },
        },
        acp: {
          backend: "acpx",
        },
      },
    ],
    channels: {
      "gewe-openclaw": {
        accounts: {
          work: {
            token: "token",
            appId: "app-id",
            groups: {
              "34757816141@chatroom": {
                bindingIdentity: {
                  selfNickname: { source: "agent_name" },
                  remark: { source: "agent_id" },
                },
              },
            },
          },
        },
      },
    },
  };
  const { api, registeredTools } = createApi(config);
  plugin.register?.(api as never);
  const tool = resolveRegisteredTool({
    registeredTools,
    name: "gewe_sync_group_binding",
    ctx: {
      config,
      senderIsOwner: true,
      agentAccountId: "work",
      messageChannel: "gewe-openclaw",
      sessionKey: buildConfiguredAcpSessionKey({
        channel: "gewe-openclaw",
        accountId: "work",
        conversationId: "34757816141@chatroom",
        agentId: "ops",
      }),
    },
  });

  await withMockFetch(
    async (url) => {
      if (url.endsWith("/gewe/v2/api/personal/getProfile")) {
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: {
              wxid: "wxid_bot",
              nickName: "Bot",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/gewe/v2/api/group/getChatroomInfo")) {
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: {
              chatroomId: "34757816141@chatroom",
              nickName: "运维群",
              remark: "old-remark",
              memberList: [{ wxid: "wxid_bot", nickName: "Bot", displayName: "Ops Agent" }],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ret: 200, msg: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    async (calls) => {
      const result = await (tool.execute as Function)("call-1", { mode: "apply" });
      assert.equal(result.details.ok, true);
      assert.equal(result.details.binding.kind, "acp");
      const urls = calls.map((entry) => entry.url);
      assert.equal(
        urls.some((url) => url.endsWith("/gewe/v2/api/group/modifyChatroomNickNameForSelf")),
        false,
      );
      assert.equal(
        urls.some((url) => url.endsWith("/gewe/v2/api/group/modifyChatroomRemark")),
        true,
      );
    },
  );
});

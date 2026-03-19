import assert from "node:assert/strict";
import test from "node:test";

import plugin from "../index.ts";

type RegisteredTool = {
  tool: unknown;
  opts?: { name?: string };
};

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
        config: {
          loadConfig() {
            return config;
          },
          async writeConfigFile() {},
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
  fn: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    await responder(String(input), init)) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("GeWe 插件会注册 agent-facing API 工具", () => {
  const { api, registeredTools } = createApi({});
  plugin.register?.(api as never);

  const toolNames = ["gewe_contacts", "gewe_groups", "gewe_moments", "gewe_personal"].map((name) =>
    resolveRegisteredTool({
      registeredTools,
      name,
      ctx: {
        config: {},
        senderIsOwner: true,
      },
    }).name,
  );

  assert.deepEqual(toolNames, ["gewe_contacts", "gewe_groups", "gewe_moments", "gewe_personal"]);
});

test("GeWe agent-facing API 工具对已配对私聊发送者不再要求 owner 权限", () => {
  const { api, registeredTools } = createApi({});
  plugin.register?.(api as never);

  const tools = ["gewe_contacts", "gewe_groups", "gewe_moments", "gewe_personal"].map((name) =>
    resolveRegisteredTool({
      registeredTools,
      name,
      ctx: {
        config: {},
        senderIsOwner: false,
        messageChannel: "gewe-openclaw",
        sessionKey: "agent:ops:gewe-openclaw:direct:wxid_direct",
        requesterSenderId: "wxid_direct",
      },
    }),
  );

  assert.deepEqual(
    tools.map((tool) => tool.ownerOnly === true),
    [false, false, false, false],
  );
});

test("GeWe agent-facing API 工具不会对非 owner 的群聊会话暴露", () => {
  const { api, registeredTools } = createApi({});
  plugin.register?.(api as never);

  for (const name of ["gewe_contacts", "gewe_groups", "gewe_moments", "gewe_personal"]) {
    assert.throws(
      () =>
        resolveRegisteredTool({
          registeredTools,
          name,
          ctx: {
            config: {},
            senderIsOwner: false,
            messageChannel: "gewe-openclaw",
            sessionKey: "agent:ops:gewe-openclaw:group:room@chatroom",
            requesterSenderId: "wxid_member",
          },
        }),
      /tool not registered:/,
    );
  }
});

test("GeWe contacts 工具会从当前私聊上下文推断 brief 目标", async () => {
  const config = {
    channels: {
      "gewe-openclaw": {
        token: "token",
        appId: "app-id",
      },
    },
  };
  const { api, registeredTools } = createApi(config);
  plugin.register?.(api as never);

  const tool = resolveRegisteredTool({
    registeredTools,
    name: "gewe_contacts",
    ctx: {
      config,
      senderIsOwner: true,
      messageChannel: "gewe-openclaw",
      sessionKey: "agent:ops:gewe-openclaw:direct:wxid_direct",
      requesterSenderId: "wxid_direct",
    },
  });

  await withMockFetch(
    async (url, init) => {
      if (url.endsWith("/gewe/v2/api/contacts/getBriefInfo")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        assert.deepEqual(body, {
          appId: "app-id",
          wxids: ["wxid_direct"],
        });
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: [{ userName: "wxid_direct", nickName: "Direct User", remark: "备注名" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    },
    async () => {
      const result = await (tool.execute as Function)("call-1", {
        action: "brief",
      });
      assert.equal(result.details.ok, true);
      assert.equal(result.details.action, "brief");
      assert.equal(result.details.input.wxids[0], "wxid_direct");
      assert.equal(result.details.data[0].remark, "备注名");
    },
  );
});

test("GeWe groups 工具会从当前群上下文推断 info 目标", async () => {
  const config = {
    channels: {
      "gewe-openclaw": {
        token: "token",
        appId: "app-id",
      },
    },
  };
  const { api, registeredTools } = createApi(config);
  plugin.register?.(api as never);

  const tool = resolveRegisteredTool({
    registeredTools,
    name: "gewe_groups",
    ctx: {
      config,
      senderIsOwner: true,
      messageChannel: "gewe-openclaw",
      sessionKey: "agent:ops:gewe-openclaw:group:room@chatroom",
    },
  });

  await withMockFetch(
    async (url, init) => {
      if (url.endsWith("/gewe/v2/api/group/getChatroomInfo")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        assert.deepEqual(body, {
          appId: "app-id",
          chatroomId: "room@chatroom",
        });
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: { chatroomId: "room@chatroom", nickName: "项目群", memberList: [] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    },
    async () => {
      const result = await (tool.execute as Function)("call-1", {
        action: "info",
      });
      assert.equal(result.details.ok, true);
      assert.equal(result.details.input.groupId, "room@chatroom");
      assert.equal(result.details.data.nickName, "项目群");
    },
  );
});

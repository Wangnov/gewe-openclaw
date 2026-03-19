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

test("GeWe 私聊可见工具会把 Zod 参数 schema 转成普通 JSON Schema", () => {
  const { api, registeredTools } = createApi({});
  plugin.register?.(api as never);

  const ctx = {
    config: {},
    senderIsOwner: false,
    messageChannel: "gewe-openclaw",
    sessionKey: "agent:ops:gewe-openclaw:direct:wxid_direct",
    requesterSenderId: "wxid_direct",
  };

  const tools = [
    "gewe_contacts",
    "gewe_groups",
    "gewe_moments",
    "gewe_personal",
    "gewe_issue_group_claim_code",
    "gewe_manage_group_allowlist",
    "gewe_sync_group_binding",
  ].map((name) =>
    resolveRegisteredTool({
      registeredTools,
      name,
      ctx,
    }),
  );

  for (const tool of tools) {
    assert.equal(typeof tool.parameters, "object", `${String(tool.name)} 应暴露 object schema`);
    assert.equal((tool.parameters as Record<string, unknown>).type, "object", `${String(tool.name)} 应暴露 JSON Schema type=object`);
    assert.equal("parse" in (tool.parameters as Record<string, unknown>), false, `${String(tool.name)} 不应暴露 Zod parse 方法`);
    assert.equal(
      "toJSONSchema" in (tool.parameters as Record<string, unknown>),
      false,
      `${String(tool.name)} 不应继续暴露 Zod toJSONSchema 方法`,
    );
  }
});

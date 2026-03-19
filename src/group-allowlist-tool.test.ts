import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import plugin from "../index.ts";
import { resolveGeweAllowFromPath } from "./pairing-store.ts";

type RegisteredTool = {
  tool: unknown;
  opts?: { name?: string };
};

function createApi(config: Record<string, unknown>, writeConfigFile?: (next: unknown) => Promise<void>) {
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
          async writeConfigFile(next: unknown) {
            if (writeConfigFile) {
              await writeConfigFile(next);
            }
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

async function withTempStateDir<T>(
  fn: (stateDir: string) => Promise<T>,
): Promise<T> {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "gewe-allowlist-tool-"));
  const original = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  try {
    return await fn(stateDir);
  } finally {
    if (original === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = original;
    }
    await fs.rm(stateDir, { recursive: true, force: true });
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("GeWe 插件会注册对已配对私聊发送者可见的群 allowlist 管理工具", () => {
  const { api, registeredTools } = createApi({});
  plugin.register?.(api as never);

  const tool = resolveRegisteredTool({
    registeredTools,
    name: "gewe_manage_group_allowlist",
    ctx: {
      config: {},
      senderIsOwner: false,
      messageChannel: "gewe-openclaw",
      sessionKey: "agent:ops:gewe-openclaw:direct:wxid_owner",
      requesterSenderId: "wxid_owner",
    },
  });

  assert.equal(tool.name, "gewe_manage_group_allowlist");
  assert.notEqual(tool.ownerOnly, true);
});

test("GeWe 群 allowlist 工具 inspect 只返回群级 allowlist，不混入私聊 pairing store", async () => {
  await withTempStateDir(async (stateDir) => {
    await writeJson(resolveGeweAllowFromPath("default", process.env), {
      version: 1,
      allowFrom: ["wxid_pairing"],
    });

    const config = {
      channels: {
        "gewe-openclaw": {
          groupPolicy: "allowlist",
          groupAllowFrom: ["wxid_global"],
          groups: {
            "room@chatroom": {
              allowFrom: ["wxid_room"],
            },
          },
        },
      },
    };
    const { api, registeredTools } = createApi(config);
    plugin.register?.(api as never);

    const tool = resolveRegisteredTool({
      registeredTools,
      name: "gewe_manage_group_allowlist",
      ctx: {
        config,
        senderIsOwner: true,
        messageChannel: "gewe-openclaw",
        sessionKey: "agent:ops:gewe-openclaw:group:room@chatroom",
      },
    });

    const result = await (tool.execute as Function)("call-1", {
      mode: "inspect",
    });
    assert.equal(result.details.ok, true);
    assert.equal(result.details.groupId, "room@chatroom");
    assert.deepEqual(result.details.overrideEntries, ["wxid_room"]);
    assert.equal("pairingEntries" in result.details, false);
    assert.deepEqual(result.details.effectiveEntries, ["wxid_global", "wxid_room"]);
    assert.equal(stateDir.length > 0, true);
  });
});

test("GeWe 群 allowlist 工具会 replace 和 clear 指定群覆盖", async () => {
  const writes: unknown[] = [];
  const config = {
    channels: {
      "gewe-openclaw": {
        groups: {
          "room@chatroom": {
            allowFrom: ["wxid_old"],
            trigger: { mode: "at" },
          },
        },
      },
    },
  };
  const { api, registeredTools } = createApi(config, async (next) => {
    writes.push(next);
  });
  plugin.register?.(api as never);

  const tool = resolveRegisteredTool({
    registeredTools,
    name: "gewe_manage_group_allowlist",
    ctx: {
      config,
      senderIsOwner: true,
    },
  });

  await (tool.execute as Function)("call-1", {
    mode: "replace",
    groupId: "room@chatroom",
    entries: ["wxid_a", "wxid_b"],
  });
  await (tool.execute as Function)("call-2", {
    mode: "clear",
    groupId: "room@chatroom",
  });

  assert.equal(writes.length, 2);
  assert.deepEqual(
    (writes[0] as Record<string, any>).channels["gewe-openclaw"].groups["room@chatroom"],
    {
      allowFrom: ["wxid_a", "wxid_b"],
      trigger: { mode: "at" },
    },
  );
  assert.deepEqual(
    (writes[1] as Record<string, any>).channels["gewe-openclaw"].groups["room@chatroom"],
    {
      trigger: { mode: "at" },
    },
  );
});

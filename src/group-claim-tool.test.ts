import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import plugin from "../index.ts";
import { resolveGeweGroupClaimCodesPath } from "./pairing-store.ts";

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

async function withTempStateDir<T>(fn: (stateDir: string) => Promise<T>): Promise<T> {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "gewe-group-claim-tool-"));
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

test("GeWe 插件会注册对已配对私聊发送者可见的群认领码签发工具", () => {
  const { api, registeredTools } = createApi({});
  plugin.register?.(api as never);

  const tool = resolveRegisteredTool({
    registeredTools,
    name: "gewe_issue_group_claim_code",
    ctx: {
      config: {},
      senderIsOwner: false,
      messageChannel: "gewe-openclaw",
      sessionKey: "agent:ops:gewe-openclaw:direct:wxid_owner",
      requesterSenderId: "wxid_owner",
    },
  });

  assert.equal(tool.name, "gewe_issue_group_claim_code");
  assert.notEqual(tool.ownerOnly, true);
});

test("GeWe 群认领码工具会在当前私聊上下文为已配对发送者签发短时单次认领码", async () => {
  await withTempStateDir(async () => {
    const config = {
      channels: {
        "gewe-openclaw": {},
      },
    };
    const { api, registeredTools } = createApi(config);
    plugin.register?.(api as never);

    const tool = resolveRegisteredTool({
      registeredTools,
      name: "gewe_issue_group_claim_code",
      ctx: {
        config,
        senderIsOwner: false,
        messageChannel: "gewe-openclaw",
        sessionKey: "agent:ops:gewe-openclaw:direct:wxid_owner",
        requesterSenderId: "wxid_owner",
      },
    });

    const result = await (tool.execute as Function)("call-1", {});
    assert.equal(result.details.ok, true);
    assert.equal(result.details.accountId, "default");
    assert.equal(result.details.issuerId, "wxid_owner");
    assert.match(String(result.details.code), /^[A-HJ-NP-Z2-9]{8}$/);
    assert.equal(result.details.recommendedGroupMessage, result.details.code);
    assert.equal(
      result.details.usageHint,
      `把机器人拉进目标群后，在群里只发送这 8 位认领码：${result.details.code}（不要加“认领码:”前缀）`,
    );

    const stored = JSON.parse(
      await fs.readFile(resolveGeweGroupClaimCodesPath("default", process.env), "utf8"),
    ) as { codes?: Array<Record<string, unknown>> };
    assert.equal(stored.codes?.length, 1);
    assert.equal(stored.codes?.[0]?.issuerId, "wxid_owner");
    assert.equal(stored.codes?.[0]?.usedAt, undefined);
  });
});

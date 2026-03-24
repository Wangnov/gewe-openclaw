import test from "node:test";
import assert from "node:assert/strict";

import plugin from "../index.ts";

type CompatRegistrationMode = "full" | "setup-only" | "setup-runtime";

function createApi(registrationMode?: CompatRegistrationMode) {
  const registeredChannels: unknown[] = [];
  const registeredTools: Array<{ tool: unknown; opts?: unknown }> = [];
  const runtime = {
    config: {
      loadConfig: () => ({}),
      writeConfigFile: async (_next: unknown) => {},
    },
  };

  const api: Record<string, unknown> = {
    id: "gewe-openclaw",
    name: "GeWe",
    source: "/tmp/gewe-openclaw",
    config: {},
    pluginConfig: {},
    runtime,
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    registerChannel(registration: unknown) {
      registeredChannels.push(registration);
    },
    registerTool(tool: unknown, opts?: unknown) {
      registeredTools.push({ tool, opts });
    },
  };

  if (registrationMode) {
    api.registrationMode = registrationMode;
  }

  return {
    api,
    registeredChannels,
    registeredTools,
  };
}

test("legacy host without registrationMode still registers channel and tools", () => {
  const { api, registeredChannels, registeredTools } = createApi();

  plugin.register?.(api as never);

  assert.equal(registeredChannels.length, 1);
  assert.equal(registeredTools.length, 4);
});

test("modern full registration still registers channel and tools", () => {
  const { api, registeredChannels, registeredTools } = createApi("full");

  plugin.register?.(api as never);

  assert.equal(registeredChannels.length, 1);
  assert.equal(registeredTools.length, 4);
});

test("modern setup-only registration only registers the channel surface", () => {
  const { api, registeredChannels, registeredTools } = createApi("setup-only");

  plugin.register?.(api as never);

  assert.equal(registeredChannels.length, 1);
  assert.equal(registeredTools.length, 0);
});

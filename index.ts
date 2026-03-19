import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { createGeweApiTools } from "./src/api-tools.js";
import { gewePlugin } from "./src/channel.js";
import { createGeweManageGroupAllowlistTool } from "./src/group-allowlist-tool.js";
import { createGeweSyncGroupBindingTool } from "./src/group-binding-tool.js";
import { setGeweRuntime } from "./src/runtime.js";

function emptyPluginConfigSchema() {
  return {
    safeParse(value: unknown) {
      if (value === undefined) {
        return { success: true as const, data: undefined };
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {
          success: false as const,
          error: { issues: [{ path: [], message: "expected config object" }] },
        };
      }
      if (Object.keys(value as Record<string, unknown>).length > 0) {
        return {
          success: false as const,
          error: { issues: [{ path: [], message: "config must be empty" }] },
        };
      }
      return { success: true as const, data: value };
    },
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  };
}

const plugin = {
  id: "gewe-openclaw",
  name: "GeWe",
  description: "OpenClaw GeWe channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setGeweRuntime(api.runtime);
    api.registerChannel({ plugin: gewePlugin });
    api.registerTool((ctx) => createGeweApiTools(ctx));
    api.registerTool((ctx) => createGeweSyncGroupBindingTool(ctx));
    api.registerTool((ctx) =>
      createGeweManageGroupAllowlistTool(ctx, {
        readConfig: () => api.runtime.config.loadConfig() as never,
        writeConfigFile: async (next) => await api.runtime.config.writeConfigFile(next),
      }),
    );
  },
};

export default plugin;

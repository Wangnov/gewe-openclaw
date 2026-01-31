import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { gewePlugin } from "./src/channel.js";
import { setGeweRuntime } from "./src/runtime.js";

const plugin = {
  id: "gewe-openclaw",
  name: "GeWe",
  description: "OpenClaw GeWe channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setGeweRuntime(api.runtime);
    api.registerChannel({ plugin: gewePlugin });
  },
};

export default plugin;

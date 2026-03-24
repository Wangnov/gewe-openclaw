import { geweSetupPlugin } from "./src/channel.setup.js";

export { geweSetupPlugin } from "./src/channel.setup.js";

// Keep the setup entry as a plain `{ plugin }` export so newer OpenClaw can
// load the channel surface without requiring newer runtime helpers at import time.
export default {
  plugin: geweSetupPlugin,
};

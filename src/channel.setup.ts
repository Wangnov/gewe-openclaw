import { CHANNEL_ID } from "./constants.js";
import { geweChannelPluginCommon } from "./channel-common.js";
import type { GeweChannelPlugin } from "./setup-wizard-types.js";
import type { ResolvedGeweAccount } from "./types.js";

export const geweSetupPlugin: GeweChannelPlugin<ResolvedGeweAccount> = {
  id: CHANNEL_ID,
  ...geweChannelPluginCommon,
};

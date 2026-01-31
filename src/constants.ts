export const CHANNEL_ID = "gewe-openclaw" as const;
export const CHANNEL_CONFIG_KEY = "gewe-openclaw" as const;
export const CHANNEL_DOCS_PATH = "/channels/gewe-openclaw" as const;
export const CHANNEL_DOCS_LABEL = "gewe-openclaw" as const;
export const CHANNEL_PREFIX_REGEX = /^(gewe-openclaw|gewe|wechat|wx):/i;
export const CHANNEL_ALIASES = ["gewe-openclaw", "gewe", "wechat", "wx"] as const;

export function stripChannelPrefix(value: string): string {
  return value.replace(CHANNEL_PREFIX_REGEX, "");
}

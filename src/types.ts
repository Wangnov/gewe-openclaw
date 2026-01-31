import type {
  BlockStreamingCoalesceConfig,
  DmConfig,
  DmPolicy,
  GroupPolicy,
  GroupToolPolicyConfig,
} from "openclaw/plugin-sdk";

export type GeweGroupConfig = {
  requireMention?: boolean;
  tools?: GroupToolPolicyConfig;
  skills?: string[];
  enabled?: boolean;
  allowFrom?: string[];
  systemPrompt?: string;
};

export type GeweAccountConfig = {
  name?: string;
  enabled?: boolean;
  apiBaseUrl?: string;
  token?: string;
  tokenFile?: string;
  appId?: string;
  appIdFile?: string;
  webhookPort?: number;
  webhookHost?: string;
  webhookPath?: string;
  webhookSecret?: string;
  webhookPublicUrl?: string;
  mediaHost?: string;
  mediaPort?: number;
  mediaPath?: string;
  mediaPublicUrl?: string;
  mediaMaxMb?: number;
  voiceAutoConvert?: boolean;
  voiceFfmpegPath?: string;
  voiceSilkPath?: string;
  voiceSilkArgs?: string[];
  voiceSampleRate?: number;
  voiceDecodePath?: string;
  voiceDecodeArgs?: string[];
  voiceDecodeSampleRate?: number;
  voiceDecodeOutput?: "pcm" | "wav";
  silkAutoDownload?: boolean;
  silkVersion?: string;
  silkBaseUrl?: string;
  silkSha256?: string;
  silkAllowUnverified?: boolean;
  silkInstallDir?: string;
  videoFfmpegPath?: string;
  videoFfprobePath?: string;
  videoThumbUrl?: string;
  downloadMinDelayMs?: number;
  downloadMaxDelayMs?: number;
  dmPolicy?: DmPolicy;
  allowFrom?: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  groupPolicy?: GroupPolicy;
  groups?: Record<string, GeweGroupConfig>;
  historyLimit?: number;
  dmHistoryLimit?: number;
  dms?: Record<string, DmConfig>;
  textChunkLimit?: number;
  chunkMode?: "length" | "newline";
  blockStreaming?: boolean;
  blockStreamingCoalesce?: BlockStreamingCoalesceConfig;
};

export type GeweConfig = {
  accounts?: Record<string, GeweAccountConfig>;
} & GeweAccountConfig;

export type CoreConfig = {
  channels?: {
    "gewe-openclaw"?: GeweConfig;
  };
  [key: string]: unknown;
};

export type GeweTokenSource = "env" | "config" | "configFile" | "none";

export type GeweAppIdSource = "env" | "config" | "configFile" | "none";

export type ResolvedGeweAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  token: string;
  tokenSource: GeweTokenSource;
  appId: string;
  appIdSource: GeweAppIdSource;
  config: GeweAccountConfig;
};

export type GeweCallbackPayload = {
  TypeName?: string;
  Appid?: string;
  Wxid?: string;
  Data?: {
    MsgId?: number;
    NewMsgId?: number;
    FromUserName?: { string?: string };
    ToUserName?: { string?: string };
    MsgType?: number;
    Content?: { string?: string };
    CreateTime?: number;
    PushContent?: string;
  };
};

export type GeweInboundMessage = {
  messageId: string;
  newMessageId: string;
  appId: string;
  botWxid: string;
  fromId: string;
  toId: string;
  senderId: string;
  senderName?: string;
  text: string;
  msgType: number;
  xml?: string;
  timestamp: number;
  isGroupChat: boolean;
};

export type GeweWebhookServerOptions = {
  port: number;
  host: string;
  path: string;
  secret?: string;
  onMessage: (message: GeweInboundMessage) => void | Promise<void>;
  onError?: (error: Error) => void;
  abortSignal?: AbortSignal;
};

export type GeweSendResult = {
  messageId: string;
  newMessageId?: string;
  toWxid: string;
  timestamp?: number;
};

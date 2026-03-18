import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  logInboundDrop,
  resolveControlCommandGate,
  type OpenClawConfig,
  type ReplyPayload,
  type RuntimeEnv,
} from "./openclaw-compat.js";

import {
  buildGeweInboundMediaPayload,
  buildGeweInboundMessageMeta,
} from "./inbound-batch.js";
import type { GeweDownloadQueue } from "./download-queue.js";
import { downloadGeweFile, downloadGeweImage, downloadGeweVideo, downloadGeweVoice } from "./download.js";
import { deliverGewePayload } from "./delivery.js";
import { applyGeweReplyModeToPayload, resolveGeweReplyOptions } from "./reply-options.js";
import { rememberGeweDirectoryObservation } from "./directory-cache.js";
import { getGeweRuntime } from "./runtime.js";
import { ensureRustSilkBinary } from "./silk.js";
import { readGeweAllowFromStore, redeemGewePairCode } from "./pairing-store.js";
import {
  normalizeGeweAllowlist,
  resolveGeweAllowlistMatch,
  resolveGeweDmMatch,
  resolveGeweDmReplyMode,
  resolveGeweDmTriggerMode,
  resolveGeweGroupAllow,
  resolveGeweGroupMatch,
  resolveGeweGroupReplyMode,
  resolveGeweGroupTriggerMode,
  resolveGeweTriggerGate,
} from "./policy.js";
import type {
  CoreConfig,
  GeweDmReplyMode,
  GeweGroupReplyMode,
  GeweInboundMessage,
  ResolvedGeweAccount,
} from "./types.js";
import {
  extractAppMsgType,
  extractFileName,
  extractLinkDetails,
  extractQuoteDetails,
  extractQuoteSummary,
  type GeweQuoteDetails,
} from "./xml.js";
import { CHANNEL_ID } from "./constants.js";
import { rememberGeweQuoteReplyContext } from "./quote-context-cache.js";

type PreparedInbound = {
  rawBody: string;
  messageType: number;
  rawXml?: string;
  appMsgXml?: string;
  appMsgType?: number;
  quoteXml?: string;
  quoteDetails?: GeweQuoteDetails;
  commandAuthorized: boolean;
  isGroup: boolean;
  senderId: string;
  senderName?: string;
  groupId?: string;
  groupName?: string;
  groupSystemPrompt?: string;
  groupSkillFilter?: string[];
  replyMode: GeweGroupReplyMode | GeweDmReplyMode;
  route: ReturnType<ReturnType<typeof getGeweRuntime>["channel"]["routing"]["resolveAgentRoute"]>;
  storePath: string;
  toWxid: string;
  messageSid: string;
  messageSids?: string[];
  messageSidFirst?: string;
  messageSidLast?: string;
  timestamp?: number;
};

type NormalizedInboundEntry = {
  message: GeweInboundMessage;
  rawBody: string;
  rawXml?: string;
  appMsgXml?: string;
  appMsgType?: number;
  quoteXml?: string;
  quoteDetails?: GeweQuoteDetails;
  download?: {
    msgType: number;
    xml: string;
  };
};

const DEFAULT_VOICE_SAMPLE_RATE = 24000;
const DEFAULT_VOICE_DECODE_TIMEOUT_MS = 30_000;
const SILK_HEADER = "#!SILK_V3";
const GEWE_PAIR_CODE_REGEX = /^[A-HJ-NP-Z2-9]{8}$/i;
const GEWE_PAIR_CODE_PREFIX_REGEX = /^配对码\s*[:：]?\s*([A-HJ-NP-Z2-9]{8})$/i;
const GEWE_PAIR_CODE_SUCCESS_REPLY = "配对成功，已加入允许列表。请重新发送上一条消息。";
const GEWE_PAIR_CODE_INVALID_REPLY = "配对码无效或已过期。";

function resolveMediaPlaceholder(msgType: number): string {
  if (msgType === 3) return "<media:image>";
  if (msgType === 34) return "<media:audio>";
  if (msgType === 43) return "<media:video>";
  if (msgType === 49) return "<media:document>";
  return "";
}

function resolveAppMsgPlaceholder(appType?: number): string {
  return typeof appType === "number" ? `<appmsg:${appType}>` : "<appmsg>";
}

function resolveGewePairCodeCandidate(rawBody: string): string | null {
  const trimmed = rawBody.trim();
  if (!trimmed) return null;
  if (GEWE_PAIR_CODE_REGEX.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const prefixed = trimmed.match(GEWE_PAIR_CODE_PREFIX_REGEX);
  return prefixed?.[1]?.toUpperCase() ?? null;
}

function looksLikeSilkVoice(params: {
  buffer: Buffer;
  contentType?: string | null;
  fileName?: string | null;
}): boolean {
  const contentType = params.contentType?.toLowerCase() ?? "";
  if (contentType.includes("silk")) return true;
  const fileName = params.fileName?.toLowerCase() ?? "";
  if (fileName.endsWith(".silk")) return true;
  if (params.buffer.length < SILK_HEADER.length) return false;
  const header = params.buffer.subarray(0, SILK_HEADER.length).toString("utf8");
  return header === SILK_HEADER;
}

function resolveVoiceDecodeSampleRate(account: ResolvedGeweAccount): number {
  const configured =
    account.config.voiceDecodeSampleRate ?? account.config.voiceSampleRate;
  if (typeof configured === "number" && configured > 0) return Math.floor(configured);
  return DEFAULT_VOICE_SAMPLE_RATE;
}

type DecodedVoice = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
};

function resolveDecodeArgs(params: {
  template: string[];
  input: string;
  output: string;
  sampleRate: number;
}): string[] {
  const mapped = params.template.map((entry) =>
    entry
      .replace(/\{input\}/g, params.input)
      .replace(/\{output\}/g, params.output)
      .replace(/\{sampleRate\}/g, String(params.sampleRate)),
  );
  const hasInput = params.template.some((entry) => entry.includes("{input}"));
  const hasOutput = params.template.some((entry) => entry.includes("{output}"));
  const next = [...mapped];
  if (!hasInput) next.unshift(params.input);
  if (!hasOutput) next.push(params.output);
  return next;
}

async function decodeSilkVoice(params: {
  account: ResolvedGeweAccount;
  buffer: Buffer;
  fileName?: string | null;
}): Promise<DecodedVoice | null> {
  const core = getGeweRuntime();
  const logger = core.logging.getChildLogger({ channel: CHANNEL_ID, module: "voice" });
  const decodeOutput = params.account.config.voiceDecodeOutput ?? "pcm";
  const sampleRate = resolveVoiceDecodeSampleRate(params.account);
  const ffmpegPath = params.account.config.voiceFfmpegPath?.trim() || "ffmpeg";
  const customPath = params.account.config.voiceDecodePath?.trim();
  const customArgs = params.account.config.voiceDecodeArgs?.length
    ? [params.account.config.voiceDecodeArgs]
    : [];
  const fallbackArgs = [
    ["{input}", "{output}"],
    ["-i", "{input}", "-o", "{output}"],
    ["{input}", "-o", "{output}"],
    ["-i", "{input}", "{output}"],
  ];
  const rustArgs = [
    "decode",
    "-i",
    "{input}",
    "-o",
    "{output}",
    "--sample-rate",
    "{sampleRate}",
    "--quiet",
  ];
  if (decodeOutput === "wav") rustArgs.push("--wav");
  const rustSilk = customPath ? null : await ensureRustSilkBinary(params.account);

  const argTemplates = customArgs.length
    ? customArgs
    : rustSilk
      ? [rustArgs]
      : fallbackArgs;
  const candidates = customPath
    ? [customPath]
    : rustSilk
      ? [rustSilk]
      : ["silk-decoder", "silk-v3-decoder", "decoder"];

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-gewe-voice-in-"));
  const silkPath = path.join(tmpDir, "voice.silk");
  const decodePath = path.join(tmpDir, decodeOutput === "wav" ? "voice.wav" : "voice.pcm");
  const wavPath = decodeOutput === "wav" ? decodePath : path.join(tmpDir, "voice.wav");

  try {
    await fs.writeFile(silkPath, params.buffer);
    let decoded = false;
    let lastError: string | null = null;
    for (const bin of candidates) {
      for (const template of argTemplates) {
        const args = resolveDecodeArgs({
          template,
          input: silkPath,
          output: decodePath,
          sampleRate,
        });
        try {
          const result = await core.system.runCommandWithTimeout([bin, ...args], {
            timeoutMs: DEFAULT_VOICE_DECODE_TIMEOUT_MS,
          });
          if (result.code === 0) {
            const stat = await fs.stat(decodePath).catch(() => null);
            if (stat?.isFile() && stat.size > 0) {
              decoded = true;
              break;
            }
          }
          lastError = result.stderr.trim() || `exit code ${result.code ?? "?"}`;
        } catch (err) {
          lastError = String(err);
        }
      }
      if (decoded) break;
    }

    if (!decoded) {
      logger.warn?.(`gewe voice decode failed: ${lastError ?? "decoder not available"}`);
      return null;
    }

    if (decodeOutput !== "wav") {
      const ffmpegArgs = [
        "-y",
        "-f",
        "s16le",
        "-ar",
        String(sampleRate),
        "-ac",
        "1",
        "-i",
        decodePath,
        wavPath,
      ];
      const ffmpegResult = await core.system.runCommandWithTimeout(
        [ffmpegPath, ...ffmpegArgs],
        { timeoutMs: DEFAULT_VOICE_DECODE_TIMEOUT_MS },
      );
      if (ffmpegResult.code !== 0) {
        logger.warn?.(
          `gewe voice ffmpeg decode failed: ${
            ffmpegResult.stderr.trim() || `exit code ${ffmpegResult.code ?? "?"}`
          }`,
        );
        return null;
      }
      const wavStat = await fs.stat(wavPath).catch(() => null);
      if (!wavStat?.isFile() || wavStat.size === 0) {
        logger.warn?.("gewe voice ffmpeg decode produced empty output");
        return null;
      }
    }

    const buffer = await fs.readFile(wavPath);
    if (!buffer.length) return null;
    return {
      buffer,
      contentType: "audio/wav",
      fileName: "voice.wav",
    };
  } catch (err) {
    logger.warn?.(`gewe voice decode failed: ${String(err)}`);
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function resolveInboundText(message: GeweInboundMessage): { text: string; xml?: string } {
  const content = message.text ?? "";
  if (!content) return { text: "" };
  const trimmed = content.trim();
  if (!trimmed) return { text: "" };
  return { text: trimmed, xml: message.xml };
}

function resolveLinkBody(xml: string): string {
  const details = extractLinkDetails(xml);
  const parts = [];
  if (details.title) parts.push(`[Link] ${details.title}`);
  if (details.desc) parts.push(details.desc);
  if (details.linkUrl) parts.push(details.linkUrl);
  return parts.join("\n").trim();
}

function resolveMediaMaxBytes(account: ResolvedGeweAccount): number {
  const maxMb = account.config.mediaMaxMb;
  if (typeof maxMb === "number" && maxMb > 0) return Math.floor(maxMb * 1024 * 1024);
  return 20 * 1024 * 1024;
}

function resolveGroupConversationId(message: GeweInboundMessage): string | undefined {
  if (message.fromId.endsWith("@chatroom")) {
    return message.fromId;
  }
  if (message.toId.endsWith("@chatroom")) {
    return message.toId;
  }
  return undefined;
}

function normalizeInboundEntry(params: {
  message: GeweInboundMessage;
  runtime: RuntimeEnv;
}): NormalizedInboundEntry | null {
  const { message, runtime } = params;
  const msgType = message.msgType;
  if (![1, 3, 34, 43, 49].includes(msgType)) {
    runtime.log?.(`gewe: skip unsupported msgType ${msgType}`);
    return null;
  }

  const { text, xml } = resolveInboundText(message);
  const rawBodyCandidate = (msgType === 1 ? text.trim() : "") || resolveMediaPlaceholder(msgType);
  if (!rawBodyCandidate.trim()) {
    runtime.log?.("gewe: skip empty message");
    return null;
  }

  if (msgType === 49 && xml) {
    const appType = extractAppMsgType(xml);
    if (appType === 57 || /<refermsg>/i.test(xml)) {
      return {
        message,
        rawBody: extractQuoteSummary(xml)?.body || resolveAppMsgPlaceholder(appType),
        rawXml: xml,
        appMsgXml: xml,
        appMsgType: appType,
        quoteXml: xml,
        quoteDetails: extractQuoteDetails(xml),
      };
    }
    if (appType === 5) {
      return {
        message,
        rawBody: resolveLinkBody(xml) || rawBodyCandidate,
        rawXml: xml,
        appMsgXml: xml,
        appMsgType: appType,
      };
    }
    if (appType === 74) {
      runtime.log?.("gewe: file notification received (preserve xml, skip download)");
      return {
        message,
        rawBody: resolveAppMsgPlaceholder(appType),
        rawXml: xml,
        appMsgXml: xml,
        appMsgType: appType,
      };
    }
    if (appType !== 6) {
      runtime.log?.(`gewe: preserve appmsg type ${appType ?? "unknown"} without download`);
      return {
        message,
        rawBody: resolveAppMsgPlaceholder(appType),
        rawXml: xml,
        appMsgXml: xml,
        appMsgType: appType,
      };
    }
  }

  return {
    message,
    rawBody: rawBodyCandidate,
    rawXml: xml,
    appMsgXml: msgType === 49 && xml ? xml : undefined,
    appMsgType: msgType === 49 && xml ? extractAppMsgType(xml) : undefined,
    quoteXml: undefined,
    quoteDetails: undefined,
    download:
      (msgType === 3 || msgType === 34 || msgType === 43 || msgType === 49) && xml
        ? { msgType, xml }
        : undefined,
  };
}

async function downloadInboundMediaEntry(params: {
  entry: NormalizedInboundEntry;
  account: ResolvedGeweAccount;
  maxBytes: number;
}): Promise<{ path: string; contentType?: string | null } | null> {
  const { entry, account, maxBytes } = params;
  const core = getGeweRuntime();
  if (!entry.download) {
    return null;
  }

  const { msgType, xml } = entry.download;
  let fileUrl: string | null = null;
  if (msgType === 3) {
    try {
      fileUrl = await downloadGeweImage({ account, xml, type: 2 });
    } catch {
      try {
        fileUrl = await downloadGeweImage({ account, xml, type: 1 });
      } catch {
        fileUrl = await downloadGeweImage({ account, xml, type: 3 });
      }
    }
  } else if (msgType === 34) {
    fileUrl = await downloadGeweVoice({
      account,
      xml,
      msgId: Number(entry.message.messageId),
    });
  } else if (msgType === 43) {
    fileUrl = await downloadGeweVideo({ account, xml });
  } else if (msgType === 49) {
    fileUrl = await downloadGeweFile({ account, xml });
  }

  if (!fileUrl) {
    return null;
  }

  const fetched = await core.channel.media.fetchRemoteMedia({
    url: fileUrl,
    maxBytes,
    filePathHint: fileUrl,
  });
  let buffer = fetched.buffer;
  let contentType = fetched.contentType;
  let originalFilename = msgType === 49 ? extractFileName(xml) : fetched.fileName;

  if (msgType === 34 && looksLikeSilkVoice({ buffer, contentType, fileName: originalFilename })) {
    const decoded = await decodeSilkVoice({
      account,
      buffer,
      fileName: originalFilename,
    });
    if (decoded) {
      buffer = decoded.buffer;
      contentType = decoded.contentType;
      originalFilename = decoded.fileName;
    }
  }

  const saved = await core.channel.media.saveMediaBuffer(
    buffer,
    contentType,
    "inbound",
    maxBytes,
    originalFilename,
  );
  return {
    path: saved.path,
    contentType: saved.contentType,
  };
}

async function dispatchGeweInbound(params: {
  prepared: PreparedInbound;
  account: ResolvedGeweAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  mediaList?: Array<{ path: string; contentType?: string | null }>;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { prepared, account, config, runtime, mediaList = [], statusSink } = params;
  const core = getGeweRuntime();
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config as OpenClawConfig);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath: prepared.storePath,
    sessionKey: prepared.route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "WeChat",
    from: prepared.groupId ? `group:${prepared.groupId}` : prepared.senderName || prepared.senderId,
    timestamp: prepared.timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: prepared.rawBody,
  });
  const mediaPayload = buildGeweInboundMediaPayload(mediaList);

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: prepared.rawBody,
    CommandBody: prepared.rawBody,
    From: prepared.groupId
      ? `${CHANNEL_ID}:group:${prepared.groupId}`
      : `${CHANNEL_ID}:${prepared.senderId}`,
    To: `${CHANNEL_ID}:${prepared.toWxid}`,
    SessionKey: prepared.route.sessionKey,
    AccountId: prepared.route.accountId,
    ChatType: prepared.isGroup ? "group" : "direct",
    ConversationLabel: prepared.groupId
      ? prepared.groupName || `group:${prepared.groupId}`
      : prepared.senderName || `user:${prepared.senderId}`,
    SenderName: prepared.senderName || undefined,
    SenderId: prepared.senderId,
    CommandAuthorized: prepared.commandAuthorized,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    MessageSid: prepared.messageSid,
    MessageSidFull: prepared.messageSid,
    MessageSids: prepared.messageSids,
    MessageSidFirst: prepared.messageSidFirst,
    MessageSidLast: prepared.messageSidLast,
    MsgType: prepared.messageType,
    ...mediaPayload,
    ...(prepared.rawXml ? { GeWeXml: prepared.rawXml } : {}),
    ...(prepared.appMsgXml ? { GeWeAppMsgXml: prepared.appMsgXml } : {}),
    ...(typeof prepared.appMsgType === "number"
      ? { GeWeAppMsgType: prepared.appMsgType }
      : {}),
    ...(prepared.quoteXml ? { GeWeQuoteXml: prepared.quoteXml } : {}),
    ...(prepared.quoteDetails?.title ? { GeWeQuoteTitle: prepared.quoteDetails.title } : {}),
    ...(typeof prepared.quoteDetails?.referType === "number"
      ? { GeWeQuoteType: prepared.quoteDetails.referType }
      : {}),
    ...(prepared.quoteDetails?.svrid ? { GeWeQuoteSvrid: prepared.quoteDetails.svrid } : {}),
    ...(prepared.quoteDetails?.fromUsr ? { GeWeQuoteFromUsr: prepared.quoteDetails.fromUsr } : {}),
    ...(prepared.quoteDetails?.chatUsr ? { GeWeQuoteChatUsr: prepared.quoteDetails.chatUsr } : {}),
    ...(prepared.quoteDetails?.displayName
      ? { GeWeQuoteDisplayName: prepared.quoteDetails.displayName }
      : {}),
    ...(prepared.quoteDetails?.content
      ? { GeWeQuoteContent: prepared.quoteDetails.content }
      : {}),
    ...(prepared.quoteDetails?.partialText?.start
      ? { GeWeQuotePartialStart: prepared.quoteDetails.partialText.start }
      : {}),
    ...(prepared.quoteDetails?.partialText?.end
      ? { GeWeQuotePartialEnd: prepared.quoteDetails.partialText.end }
      : {}),
    ...(typeof prepared.quoteDetails?.partialText?.startIndex === "number"
      ? { GeWeQuotePartialStartIndex: prepared.quoteDetails.partialText.startIndex }
      : {}),
    ...(typeof prepared.quoteDetails?.partialText?.endIndex === "number"
      ? { GeWeQuotePartialEndIndex: prepared.quoteDetails.partialText.endIndex }
      : {}),
    ...(prepared.quoteDetails?.partialText?.quoteMd5
      ? { GeWeQuotePartialQuoteMd5: prepared.quoteDetails.partialText.quoteMd5 }
      : {}),
    ...(prepared.quoteDetails?.partialText?.text
      ? { GeWeQuotePartialText: prepared.quoteDetails.partialText.text }
      : {}),
    ...(prepared.quoteDetails?.msgSource
      ? { GeWeQuoteMsgSource: prepared.quoteDetails.msgSource }
      : {}),
    GroupSystemPrompt: prepared.groupSystemPrompt,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `${CHANNEL_ID}:${prepared.toWxid}`,
  });

  await core.channel.session.recordInboundSession({
    storePath: prepared.storePath,
    sessionKey: ctxPayload.SessionKey ?? prepared.route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`gewe: failed updating session meta: ${String(err)}`);
    },
  });

  rememberGeweQuoteReplyContext({
    accountId: account.accountId,
    messageId: prepared.messageSid,
    svrid: prepared.quoteDetails?.svrid,
    partialText: prepared.quoteDetails?.partialText,
  });
  const repliedRef = { value: false };

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config as OpenClawConfig,
    replyOptions: resolveGeweReplyOptions(account, {
      skillFilter: prepared.groupSkillFilter,
    }),
    dispatcherOptions: {
      deliver: async (payload: ReplyPayload) => {
        const nextPayload = applyGeweReplyModeToPayload(payload, {
          mode: prepared.replyMode,
          isGroup: prepared.isGroup,
          senderId: prepared.senderId,
          defaultReplyToId: prepared.messageSid,
          repliedRef,
        });
        await deliverGewePayload({
          payload: nextPayload,
          account,
          cfg: config as OpenClawConfig,
          toWxid: prepared.toWxid,
          statusSink: (patch) => statusSink?.(patch),
        });
      },
      onError: (err, info) => {
        runtime.error?.(`[${account.accountId}] GeWe ${info.kind} reply failed: ${String(err)}`);
      },
    },
  });
}

export async function handleGeweInbound(params: {
  message: GeweInboundMessage;
  account: ResolvedGeweAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  downloadQueue: GeweDownloadQueue;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  await handleGeweInboundBatch({
    messages: [params.message],
    account: params.account,
    config: params.config,
    runtime: params.runtime,
    downloadQueue: params.downloadQueue,
    statusSink: params.statusSink,
  });
}

export async function handleGeweInboundBatch(params: {
  messages: GeweInboundMessage[];
  account: ResolvedGeweAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  downloadQueue: GeweDownloadQueue;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { messages, account, config, runtime, downloadQueue, statusSink } = params;
  if (messages.length === 0) {
    return;
  }

  const core = getGeweRuntime();
  const entries = messages
    .map((message) => normalizeInboundEntry({ message, runtime }))
    .filter((entry): entry is NormalizedInboundEntry => Boolean(entry));
  if (entries.length === 0) {
    return;
  }

  const lastMessage = entries.at(-1)!.message;
  const isGroup = lastMessage.isGroupChat;
  const senderId = lastMessage.senderId;
  const senderName = lastMessage.senderName;
  const groupId = isGroup ? resolveGroupConversationId(lastMessage) : undefined;
  const toWxid = isGroup ? groupId ?? lastMessage.fromId : senderId;
  const rawBodyCandidate = entries
    .map((entry) => entry.rawBody.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!rawBodyCandidate) {
    runtime.log?.("gewe: skip empty batch");
    return;
  }

  statusSink?.({ lastInboundAt: Date.now() });
  rememberGeweDirectoryObservation({
    accountId: account.accountId,
    senderId,
    senderName,
    groupId,
  });

  const dmPolicy = account.config.dmPolicy ?? "pairing";
  const defaultGroupPolicy = config.channels?.defaults?.groupPolicy;
  const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";

  const configAllowFrom = normalizeGeweAllowlist(account.config.allowFrom);
  const configGroupAllowFrom = normalizeGeweAllowlist(account.config.groupAllowFrom);
  const storeAllowFrom = await readGeweAllowFromStore({
    accountId: account.accountId,
  }).catch((err) => {
    runtime.error?.(
      `gewe: failed reading local allowFrom store for ${account.accountId}: ${String(err)}`,
    );
    return [];
  });
  const storeAllowList = normalizeGeweAllowlist(storeAllowFrom);

  const groupMatch = isGroup
    ? resolveGeweGroupMatch({
        groups: account.config.groups,
        groupId: groupId ?? "",
        groupName: undefined,
      })
    : undefined;
  const dmMatch = !isGroup
    ? resolveGeweDmMatch({
        dms: account.config.dms,
        senderId,
        senderName,
      })
    : undefined;

  if (isGroup && groupMatch && !groupMatch.allowed) {
    runtime.log?.(`gewe: drop group ${groupId} (not allowlisted)`);
    return;
  }
  if (groupMatch?.groupConfig?.enabled === false || groupMatch?.wildcardConfig?.enabled === false) {
    runtime.log?.(`gewe: drop group ${groupId} (disabled)`);
    return;
  }

  const directRoomAllowFrom = normalizeGeweAllowlist(groupMatch?.groupConfig?.allowFrom);
  const wildcardRoomAllowFrom = normalizeGeweAllowlist(groupMatch?.wildcardConfig?.allowFrom);
  const roomAllowFrom =
    directRoomAllowFrom.length > 0 ? directRoomAllowFrom : wildcardRoomAllowFrom;
  const baseGroupAllowFrom =
    configGroupAllowFrom.length > 0 ? configGroupAllowFrom : configAllowFrom;
  const effectiveAllowFrom = [...configAllowFrom, ...storeAllowList].filter(Boolean);
  const effectiveGroupAllowFrom = [...baseGroupAllowFrom, ...storeAllowList].filter(Boolean);

  const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
    cfg: config as OpenClawConfig,
    surface: CHANNEL_ID,
  });
  const useAccessGroups = config.commands?.useAccessGroups !== false;
  const senderAllowedForCommands = resolveGeweAllowlistMatch({
    allowFrom: isGroup ? effectiveGroupAllowFrom : effectiveAllowFrom,
    senderId,
    senderName,
  }).allowed;
  const hasControlCommand = core.channel.text.hasControlCommand(
    rawBodyCandidate,
    config as OpenClawConfig,
  );
  const commandGate = resolveControlCommandGate({
    useAccessGroups,
    authorizers: [
      {
        configured: (isGroup ? effectiveGroupAllowFrom : effectiveAllowFrom).length > 0,
        allowed: senderAllowedForCommands,
      },
    ],
    allowTextCommands,
    hasControlCommand,
  });
  const commandAuthorized = commandGate.commandAuthorized;

  if (isGroup) {
    const groupAllow = resolveGeweGroupAllow({
      groupPolicy,
      outerAllowFrom: effectiveGroupAllowFrom,
      innerAllowFrom: roomAllowFrom,
      senderId,
      senderName,
    });
    if (!groupAllow.allowed) {
      runtime.log?.(`gewe: drop group sender ${senderId} (policy=${groupPolicy})`);
      return;
    }
  } else {
    if (dmPolicy === "disabled") {
      runtime.log?.(`gewe: drop DM sender=${senderId} (dmPolicy=disabled)`);
      return;
    }
    if (dmPolicy !== "open") {
      const dmAllowed = resolveGeweAllowlistMatch({
        allowFrom: effectiveAllowFrom,
        senderId,
        senderName,
      }).allowed;
      if (!dmAllowed) {
        if (dmPolicy === "pairing") {
          const pairCode = resolveGewePairCodeCandidate(rawBodyCandidate);
          if (pairCode) {
            const redeemed = await redeemGewePairCode({
              accountId: account.accountId,
              code: pairCode,
              id: senderId,
            }).catch((err) => {
              runtime.error?.(`gewe: pair code redeem failed for ${senderId}: ${String(err)}`);
              return null;
            });
            try {
              await deliverGewePayload({
                payload: {
                  text: redeemed ? GEWE_PAIR_CODE_SUCCESS_REPLY : GEWE_PAIR_CODE_INVALID_REPLY,
                },
                account,
                cfg: config as OpenClawConfig,
                toWxid,
                statusSink: (patch) => statusSink?.(patch),
              });
            } catch (err) {
              runtime.error?.(`gewe: pair code reply failed for ${senderId}: ${String(err)}`);
            }
          }
        }
        runtime.log?.(`gewe: drop DM sender ${senderId} (dmPolicy=${dmPolicy})`);
        return;
      }
    }
  }

  if (isGroup && commandGate.shouldBlock) {
    logInboundDrop({
      log: (msg) => runtime.log?.(msg),
      channel: CHANNEL_ID,
      reason: "control command (unauthorized)",
      target: senderId,
    });
    return;
  }

  const mentionRegexes = core.channel.mentions.buildMentionRegexes(config as OpenClawConfig);
  const wasAtTriggered = mentionRegexes.length
    ? core.channel.mentions.matchesMentionPatterns(rawBodyCandidate, mentionRegexes)
    : false;
  const latestQuote = entries.at(-1)?.quoteDetails;
  const wasQuoteTriggered = Boolean(
    latestQuote &&
      (!isGroup || latestQuote.fromUsr?.trim() === lastMessage.botWxid.trim()),
  );
  const triggerMode = isGroup
    ? resolveGeweGroupTriggerMode({
        groupConfig: groupMatch?.groupConfig,
        wildcardConfig: groupMatch?.wildcardConfig,
      })
    : resolveGeweDmTriggerMode({
        dmConfig: dmMatch?.dmConfig,
        wildcardConfig: dmMatch?.wildcardConfig,
      });
  const triggerGate = resolveGeweTriggerGate({
    isGroup,
    triggerMode,
    wasAtTriggered,
    wasQuoteTriggered,
    allowTextCommands,
    hasControlCommand,
    commandAuthorized,
  });
  if (triggerGate.shouldSkip) {
    runtime.log?.(
      isGroup
        ? `gewe: drop group ${groupId} (trigger=${triggerMode})`
        : `gewe: drop DM sender ${senderId} (trigger=${triggerMode})`,
    );
    return;
  }

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config as OpenClawConfig,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: isGroup ? "group" : "direct",
      id: isGroup ? groupId ?? "" : senderId,
    },
  });
  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  const messageMeta = buildGeweInboundMessageMeta(entries.map((entry) => entry.message));

  const prepared: PreparedInbound = {
    rawBody: rawBodyCandidate,
    messageType: lastMessage.msgType,
    rawXml: entries.at(-1)?.rawXml,
    appMsgXml: entries.at(-1)?.appMsgXml,
    appMsgType: entries.at(-1)?.appMsgType,
    quoteXml: entries.at(-1)?.quoteXml,
    quoteDetails: entries.at(-1)?.quoteDetails,
    commandAuthorized,
    isGroup,
    senderId,
    senderName: senderName || undefined,
    groupId,
    groupName: undefined,
    groupSystemPrompt: isGroup
      ? groupMatch?.groupConfig?.systemPrompt?.trim() ||
        groupMatch?.wildcardConfig?.systemPrompt?.trim() ||
        undefined
      : dmMatch?.dmConfig?.systemPrompt?.trim() ||
        dmMatch?.wildcardConfig?.systemPrompt?.trim() ||
        undefined,
    groupSkillFilter: isGroup
      ? groupMatch?.groupConfig?.skills ?? groupMatch?.wildcardConfig?.skills
      : dmMatch?.dmConfig?.skills ?? dmMatch?.wildcardConfig?.skills,
    replyMode: isGroup
      ? resolveGeweGroupReplyMode({
          groupConfig: groupMatch?.groupConfig,
          wildcardConfig: groupMatch?.wildcardConfig,
          autoQuoteReply: account.config.autoQuoteReply,
        })
      : resolveGeweDmReplyMode({
          dmConfig: dmMatch?.dmConfig,
          wildcardConfig: dmMatch?.wildcardConfig,
          autoQuoteReply: account.config.autoQuoteReply,
        }),
    route,
    storePath,
    toWxid,
    messageSid: messageMeta.messageSid ?? lastMessage.newMessageId,
    messageSids: messageMeta.messageSids,
    messageSidFirst: messageMeta.messageSidFirst,
    messageSidLast: messageMeta.messageSidLast,
    timestamp: messageMeta.timestamp ?? lastMessage.timestamp,
  };

  core.channel.activity.record({
    channel: CHANNEL_ID,
    accountId: account.accountId,
    direction: "inbound",
  });

  const downloadEntries = entries.filter((entry) => Boolean(entry.download));
  if (downloadEntries.length === 0) {
    await dispatchGeweInbound({
      prepared,
      account,
      config,
      runtime,
      statusSink,
      mediaList: [],
    });
    return;
  }

  const maxBytes = resolveMediaMaxBytes(account);
  const messageIds = entries.map((entry) => entry.message.newMessageId);
  const jobKey = `${lastMessage.appId}:${messageIds[0]}:${messageIds.at(-1)}:${messageIds.length}`;
  const enqueued = downloadQueue.enqueue({
    key: jobKey,
    run: async () => {
      const mediaList: Array<{ path: string; contentType?: string | null }> = [];
      for (const entry of downloadEntries) {
        try {
          const saved = await downloadInboundMediaEntry({
            entry,
            account,
            maxBytes,
          });
          if (saved) {
            mediaList.push(saved);
          }
        } catch (err) {
          runtime.error?.(
            `gewe: media download failed for ${entry.message.newMessageId}: ${String(err)}`,
          );
        }
      }

      await dispatchGeweInbound({
        prepared,
        account,
        config,
        runtime,
        statusSink,
        mediaList,
      });
    },
  });

  if (!enqueued) {
    runtime.log?.(`gewe: duplicate inbound batch ${jobKey} skipped`);
  }
}

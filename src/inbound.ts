import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { OpenClawConfig, ReplyPayload, RuntimeEnv } from "openclaw/plugin-sdk";
import { logInboundDrop, resolveControlCommandGate } from "openclaw/plugin-sdk";

import type { GeweDownloadQueue } from "./download-queue.js";
import { downloadGeweFile, downloadGeweImage, downloadGeweVideo, downloadGeweVoice } from "./download.js";
import { deliverGewePayload } from "./delivery.js";
import { getGeweRuntime } from "./runtime.js";
import { ensureRustSilkBinary } from "./silk.js";
import {
  normalizeGeweAllowlist,
  resolveGeweAllowlistMatch,
  resolveGeweGroupAllow,
  resolveGeweGroupMatch,
  resolveGeweMentionGate,
  resolveGeweRequireMention,
} from "./policy.js";
import type { CoreConfig, GeweInboundMessage, ResolvedGeweAccount } from "./types.js";
import { extractAppMsgType, extractFileName, extractLinkDetails } from "./xml.js";
import { CHANNEL_ID } from "./constants.js";

type PreparedInbound = {
  rawBody: string;
  commandAuthorized: boolean;
  isGroup: boolean;
  senderId: string;
  senderName?: string;
  groupId?: string;
  groupName?: string;
  groupSystemPrompt?: string;
  route: ReturnType<ReturnType<typeof getGeweRuntime>["channel"]["routing"]["resolveAgentRoute"]>;
  storePath: string;
  toWxid: string;
  messageSid: string;
  timestamp?: number;
};

const DEFAULT_VOICE_SAMPLE_RATE = 24000;
const DEFAULT_VOICE_DECODE_TIMEOUT_MS = 30_000;
const SILK_HEADER = "#!SILK_V3";

function resolveMediaPlaceholder(msgType: number): string {
  if (msgType === 3) return "<media:image>";
  if (msgType === 34) return "<media:audio>";
  if (msgType === 43) return "<media:video>";
  if (msgType === 49) return "<media:document>";
  return "";
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

async function dispatchGeweInbound(params: {
  prepared: PreparedInbound;
  account: ResolvedGeweAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  media?: { path?: string; contentType?: string };
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { prepared, account, config, runtime, media, statusSink } = params;
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
    MediaPath: media?.path,
    MediaType: media?.contentType,
    MediaUrl: media?.path,
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

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config as OpenClawConfig,
    dispatcherOptions: {
      deliver: async (payload: ReplyPayload) => {
        await deliverGewePayload({
          payload,
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
  const { message, account, config, runtime, downloadQueue, statusSink } = params;
  const core = getGeweRuntime();

  const msgType = message.msgType;
  if (![1, 3, 34, 43, 49].includes(msgType)) {
    runtime.log?.(`gewe: skip unsupported msgType ${msgType}`);
    return;
  }
  const isGroup = message.isGroupChat;
  const senderId = message.senderId;
  const senderName = message.senderName;
  const groupId = isGroup ? message.fromId : undefined;
  const toWxid = isGroup ? message.fromId : senderId;

  statusSink?.({ lastInboundAt: Date.now() });

  const dmPolicy = account.config.dmPolicy ?? "pairing";
  const defaultGroupPolicy = config.channels?.defaults?.groupPolicy;
  const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";

  const configAllowFrom = normalizeGeweAllowlist(account.config.allowFrom);
  const configGroupAllowFrom = normalizeGeweAllowlist(account.config.groupAllowFrom);
  const storeAllowFrom = await core.channel.pairing
    .readAllowFromStore(CHANNEL_ID)
    .catch(() => []);
  const storeAllowList = normalizeGeweAllowlist(storeAllowFrom);

  const groupMatch = isGroup
    ? resolveGeweGroupMatch({
        groups: account.config.groups,
        groupId: groupId ?? "",
        groupName: undefined,
      })
    : undefined;

  if (isGroup && groupMatch && !groupMatch.allowed) {
    runtime.log?.(`gewe: drop group ${groupId} (not allowlisted)`);
    return;
  }
  if (groupMatch?.groupConfig?.enabled === false) {
    runtime.log?.(`gewe: drop group ${groupId} (disabled)`);
    return;
  }

  const roomAllowFrom = normalizeGeweAllowlist(groupMatch?.groupConfig?.allowFrom);
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
  const { text } = resolveInboundText(message);
  const isPlainText = msgType === 1;
  const rawBodyCandidate =
    (isPlainText ? text.trim() : "") || resolveMediaPlaceholder(msgType);
  if (!rawBodyCandidate.trim()) {
    runtime.log?.("gewe: skip empty message");
    return;
  }
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
          const { code, created } = await core.channel.pairing.upsertPairingRequest({
            channel: CHANNEL_ID,
            id: senderId,
            meta: { name: senderName || undefined },
          });
          if (created) {
            try {
              await deliverGewePayload({
                payload: { text: core.channel.pairing.buildPairingReply({
                  channel: CHANNEL_ID,
                  idLine: `Your WeChat id: ${senderId}`,
                  code,
                }) },
                account,
                cfg: config as OpenClawConfig,
                toWxid,
                statusSink: (patch) => statusSink?.(patch),
              });
            } catch (err) {
              runtime.error?.(`gewe: pairing reply failed for ${senderId}: ${String(err)}`);
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
  const wasMentioned = mentionRegexes.length
    ? core.channel.mentions.matchesMentionPatterns(rawBodyCandidate, mentionRegexes)
    : false;
  const shouldRequireMention = isGroup
    ? resolveGeweRequireMention({
        groupConfig: groupMatch?.groupConfig,
        wildcardConfig: groupMatch?.wildcardConfig,
      })
    : false;
  const mentionGate = resolveGeweMentionGate({
    isGroup,
    requireMention: shouldRequireMention,
    wasMentioned,
    allowTextCommands,
    hasControlCommand,
    commandAuthorized,
  });
  if (isGroup && mentionGate.shouldSkip) {
    runtime.log?.(`gewe: drop group ${groupId} (no mention)`);
    return;
  }

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config as OpenClawConfig,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: isGroup ? "group" : "dm",
      id: isGroup ? groupId ?? "" : senderId,
    },
  });
  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });

  const prepared: PreparedInbound = {
    rawBody: rawBodyCandidate,
    commandAuthorized,
    isGroup,
    senderId,
    senderName: senderName || undefined,
    groupId,
    groupName: undefined,
    groupSystemPrompt: groupMatch?.groupConfig?.systemPrompt?.trim() || undefined,
    route,
    storePath,
    toWxid,
    messageSid: message.newMessageId,
    timestamp: message.timestamp,
  };

  core.channel.activity.record({
    channel: CHANNEL_ID,
    accountId: account.accountId,
    direction: "inbound",
  });

  const xml = message.xml;
  const maxBytes = resolveMediaMaxBytes(account);
  const needsDownload =
    msgType === 3 || msgType === 34 || msgType === 43 || msgType === 49;

  if (msgType === 49 && xml) {
    const appType = extractAppMsgType(xml);
    if (appType === 5) {
      const linkBody = resolveLinkBody(xml);
      prepared.rawBody = linkBody || prepared.rawBody;
      await dispatchGeweInbound({
        prepared,
        account,
        config,
        runtime,
        statusSink,
      });
      return;
    }
    if (appType === 74) {
      runtime.log?.("gewe: file notification received (skip download)");
      return;
    }
    if (appType !== 6) {
      runtime.log?.(`gewe: unhandled appmsg type ${appType ?? "unknown"}`);
      return;
    }
  }

  if (!needsDownload || !xml) {
    await dispatchGeweInbound({
      prepared,
      account,
      config,
      runtime,
      statusSink,
    });
    return;
  }

  const jobKey = `${message.appId}:${message.newMessageId}`;
  const enqueued = downloadQueue.enqueue({
    key: jobKey,
    run: async () => {
      try {
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
          fileUrl = await downloadGeweVoice({ account, xml, msgId: Number(message.messageId) });
        } else if (msgType === 43) {
          fileUrl = await downloadGeweVideo({ account, xml });
        } else if (msgType === 49) {
          fileUrl = await downloadGeweFile({ account, xml });
        }

        if (!fileUrl) {
          await dispatchGeweInbound({
            prepared,
            account,
            config,
            runtime,
            statusSink,
          });
          return;
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

        await dispatchGeweInbound({
          prepared,
          account,
          config,
          runtime,
          statusSink,
          media: { path: saved.path, contentType: saved.contentType },
        });
      } catch (err) {
        runtime.error?.(`gewe: media download failed: ${String(err)}`);
        await dispatchGeweInbound({
          prepared,
          account,
          config,
          runtime,
          statusSink,
        });
      }
    },
  });

  if (!enqueued) {
    runtime.log?.(`gewe: duplicate message ${jobKey} skipped`);
  }
}

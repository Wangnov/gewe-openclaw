import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { OpenClawConfig, ReplyPayload } from "openclaw/plugin-sdk";
import { extractOriginalFilename, extensionForMime } from "openclaw/plugin-sdk";
import { CHANNEL_ID } from "./constants.js";
import { getGeweRuntime } from "./runtime.js";
import {
  sendFileGewe,
  sendImageGewe,
  sendLinkGewe,
  sendTextGewe,
  sendVideoGewe,
  sendVoiceGewe,
} from "./send.js";
import type { GeweSendResult, ResolvedGeweAccount } from "./types.js";

type GeweChannelData = {
  ats?: string;
  link?: {
    title: string;
    desc: string;
    linkUrl: string;
    thumbUrl?: string;
  };
  video?: {
    thumbUrl: string;
    videoDuration: number;
  };
  voiceDuration?: number;
  voiceDurationMs?: number;
  fileName?: string;
  forceFile?: boolean;
};

type ResolvedMedia = {
  publicUrl: string;
  contentType?: string;
  fileName?: string;
  localPath?: string;
};

const LINK_THUMB_MAX_BYTES = 50 * 1024;
const LINK_THUMB_FETCH_MAX_BYTES = 2 * 1024 * 1024;
const LINK_THUMB_MAX_SIDE = 320;
const LINK_THUMB_QUALITY_STEPS = [80, 70, 60, 50, 40];
const DEFAULT_VOICE_SAMPLE_RATE = 24000;
const DEFAULT_VOICE_FFMPEG = "ffmpeg";
const DEFAULT_VOICE_SILK = "silk-encoder";
const DEFAULT_VOICE_TIMEOUT_MS = 30_000;
const DEFAULT_VIDEO_FFMPEG = "ffmpeg";
const DEFAULT_VIDEO_FFPROBE = "ffprobe";
const DEFAULT_VIDEO_TIMEOUT_MS = 30_000;
const DEFAULT_VIDEO_THUMB_SECONDS = 0.5;
const PCM_BYTES_PER_SAMPLE = 2;
const DEFAULT_LINK_THUMB_PATH = fileURLToPath(
  new URL("../assets/gewe-rs_logo.jpeg", import.meta.url),
);

function looksLikeHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isFileUrl(value: string): boolean {
  return /^file:\/\//i.test(value);
}

function normalizeFileUrl(value: string): string {
  if (!isFileUrl(value)) return value;
  try {
    const url = new URL(value);
    return url.pathname ? decodeURIComponent(url.pathname) : value;
  } catch {
    return value;
  }
}

function looksLikeTtsVoiceMediaUrl(value: string): boolean {
  if (!value || looksLikeHttpUrl(value)) return false;
  const localPath = normalizeFileUrl(value);
  const base = path.basename(localPath).toLowerCase();
  const parent = path.basename(path.dirname(localPath)).toLowerCase();
  if (!/^voice-\d+/.test(base)) return false;
  return parent.startsWith("tts-");
}

function buildPublicUrl(baseUrl: string, id: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return `${trimmed}/${encodeURIComponent(id)}`;
}

function resolveMediaMaxBytes(account: ResolvedGeweAccount): number {
  const maxMb = account.config.mediaMaxMb;
  if (typeof maxMb === "number" && maxMb > 0) return Math.floor(maxMb * 1024 * 1024);
  return 20 * 1024 * 1024;
}

function resolveGeweData(payload: ReplyPayload): GeweChannelData | undefined {
  const data = payload.channelData as
    | { "gewe-openclaw"?: GeweChannelData; gewe?: GeweChannelData }
    | undefined;
  return data?.[CHANNEL_ID] ?? data?.gewe;
}

function isSilkAudio(opts: { contentType?: string; fileName?: string }): boolean {
  if (opts.contentType?.toLowerCase().includes("silk")) return true;
  return opts.fileName?.toLowerCase().endsWith(".silk") ?? false;
}

function resolveVoiceDurationMs(geweData?: GeweChannelData): number | undefined {
  const ms =
    typeof geweData?.voiceDurationMs === "number"
      ? geweData.voiceDurationMs
      : typeof geweData?.voiceDuration === "number"
        ? geweData.voiceDuration
        : undefined;
  if (!ms || ms <= 0) return undefined;
  return Math.floor(ms);
}

function resolveVoiceSampleRate(account: ResolvedGeweAccount): number {
  const rate = account.config.voiceSampleRate;
  if (typeof rate === "number" && rate > 0) return Math.floor(rate);
  return DEFAULT_VOICE_SAMPLE_RATE;
}

function resolveVideoFfmpegPath(account: ResolvedGeweAccount): string {
  return (
    account.config.videoFfmpegPath?.trim() ||
    account.config.voiceFfmpegPath?.trim() ||
    DEFAULT_VIDEO_FFMPEG
  );
}

function resolveVideoFfprobePath(account: ResolvedGeweAccount, ffmpegPath: string): string {
  const configured = account.config.videoFfprobePath?.trim();
  if (configured) return configured;
  if (ffmpegPath.endsWith("ffmpeg")) {
    return `${ffmpegPath.slice(0, -"ffmpeg".length)}ffprobe`;
  }
  return DEFAULT_VIDEO_FFPROBE;
}

async function probeVideoDurationSeconds(params: {
  account: ResolvedGeweAccount;
  sourcePath: string;
}): Promise<number | null> {
  const core = getGeweRuntime();
  const logger = core.logging.getChildLogger({ channel: CHANNEL_ID, module: "video" });
  const ffmpegPath = resolveVideoFfmpegPath(params.account);
  const ffprobePath = resolveVideoFfprobePath(params.account, ffmpegPath);
  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    params.sourcePath,
  ];
  const result = await core.system.runCommandWithTimeout([ffprobePath, ...args], {
    timeoutMs: DEFAULT_VIDEO_TIMEOUT_MS,
  });
  if (result.code !== 0) {
    logger.warn?.(
      `gewe video probe failed: ${result.stderr.trim() || `exit code ${result.code ?? "?"}`}`,
    );
    return null;
  }
  const raw = result.stdout.trim();
  const seconds = Number.parseFloat(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    logger.warn?.(`gewe video probe returned invalid duration: "${raw}"`);
    return null;
  }
  return Math.max(1, Math.round(seconds));
}

async function generateVideoThumbBuffer(params: {
  account: ResolvedGeweAccount;
  sourcePath: string;
}): Promise<Buffer | null> {
  const core = getGeweRuntime();
  const logger = core.logging.getChildLogger({ channel: CHANNEL_ID, module: "video" });
  const ffmpegPath = resolveVideoFfmpegPath(params.account);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-gewe-video-"));
  const thumbPath = path.join(tmpDir, "thumb.png");

  try {
    const args = [
      "-y",
      "-ss",
      String(DEFAULT_VIDEO_THUMB_SECONDS),
      "-i",
      params.sourcePath,
      "-frames:v",
      "1",
      "-vf",
      `scale=${LINK_THUMB_MAX_SIDE}:-1:force_original_aspect_ratio=decrease`,
      thumbPath,
    ];
    const result = await core.system.runCommandWithTimeout([ffmpegPath, ...args], {
      timeoutMs: DEFAULT_VIDEO_TIMEOUT_MS,
    });
    if (result.code !== 0) {
      logger.warn?.(
        `gewe video thumb failed: ${result.stderr.trim() || `exit code ${result.code ?? "?"}`}`,
      );
      return null;
    }
    const buffer = await fs.readFile(thumbPath);
    if (!buffer.length) {
      logger.warn?.("gewe video thumb generated empty output");
      return null;
    }
    return buffer;
  } catch (err) {
    logger.warn?.(`gewe video thumb failed: ${String(err)}`);
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function resolveSilkArgs(params: {
  template: string[];
  input: string;
  output: string;
  sampleRate: number;
}): string[] {
  const { template, input, output, sampleRate } = params;
  const mapped = template.map((entry) =>
    entry
      .replace(/\{input\}/g, input)
      .replace(/\{output\}/g, output)
      .replace(/\{sampleRate\}/g, String(sampleRate)),
  );
  const hasInput = template.some((entry) => entry.includes("{input}"));
  const hasOutput = template.some((entry) => entry.includes("{output}"));
  const next = [...mapped];
  if (!hasInput) next.unshift(input);
  if (!hasOutput) next.push(output);
  return next;
}

async function convertAudioToSilk(params: {
  account: ResolvedGeweAccount;
  sourcePath: string;
}): Promise<{ buffer: Buffer; durationMs: number } | null> {
  const core = getGeweRuntime();
  const logger = core.logging.getChildLogger({ channel: CHANNEL_ID, module: "voice" });
  if (!params.account.config.voiceAutoConvert) return null;

  const sampleRate = resolveVoiceSampleRate(params.account);
  const ffmpegPath = params.account.config.voiceFfmpegPath?.trim() || DEFAULT_VOICE_FFMPEG;
  const silkPath = params.account.config.voiceSilkPath?.trim() || DEFAULT_VOICE_SILK;
  const customArgs =
    params.account.config.voiceSilkArgs?.length ? [params.account.config.voiceSilkArgs] : [];
  const fallbackArgs = [
    ["-i", "{input}", "-o", "{output}", "-rate", "{sampleRate}"],
    ["{input}", "{output}", "-rate", "{sampleRate}"],
    ["{input}", "{output}", "{sampleRate}"],
    ["{input}", "{output}"],
  ];
  const argTemplates = customArgs.length ? customArgs : fallbackArgs;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-gewe-voice-"));
  const pcmPath = path.join(tmpDir, "voice.pcm");
  const silkOutPath = path.join(tmpDir, "voice.silk");

  try {
    const ffmpegArgs = [
      "-y",
      "-i",
      params.sourcePath,
      "-ac",
      "1",
      "-ar",
      String(sampleRate),
      "-f",
      "s16le",
      pcmPath,
    ];
    const ffmpegResult = await core.system.runCommandWithTimeout(
      [ffmpegPath, ...ffmpegArgs],
      { timeoutMs: DEFAULT_VOICE_TIMEOUT_MS },
    );
    if (ffmpegResult.code !== 0) {
      throw new Error(
        `ffmpeg failed: code=${ffmpegResult.code ?? "?"} stderr=${ffmpegResult.stderr.trim()}`,
      );
    }

    let pcmStat = await fs.stat(pcmPath);
    const frameSamples = sampleRate % 50 === 0 ? sampleRate / 50 : 0; // 20ms frames
    const frameBytes = frameSamples > 0 ? frameSamples * PCM_BYTES_PER_SAMPLE : 0;
    if (frameBytes > 0 && pcmStat.size % frameBytes !== 0) {
      const trimmedSize = pcmStat.size - (pcmStat.size % frameBytes);
      if (trimmedSize <= 0) {
        throw new Error("ffmpeg produced empty PCM after frame trim");
      }
      await fs.truncate(pcmPath, trimmedSize);
      pcmStat = await fs.stat(pcmPath);
    }

    const durationMs = Math.max(
      1,
      Math.round((pcmStat.size / (sampleRate * PCM_BYTES_PER_SAMPLE)) * 1000),
    );

    let encoded = false;
    let lastError: string | null = null;
    for (const template of argTemplates) {
      const args = resolveSilkArgs({
        template,
        input: pcmPath,
        output: silkOutPath,
        sampleRate,
      });
      const result = await core.system.runCommandWithTimeout([silkPath, ...args], {
        timeoutMs: DEFAULT_VOICE_TIMEOUT_MS,
      });
      if (result.code === 0) {
        const outStat = await fs.stat(silkOutPath).catch(() => null);
        if (outStat?.isFile()) {
          encoded = true;
          break;
        }
      }
      lastError = result.stderr.trim() || `exit code ${result.code ?? "?"}`;
    }
    if (!encoded) {
      throw new Error(
        `silk encoder failed (${silkPath}): ${lastError ?? "unknown error"}`,
      );
    }

    const buffer = await fs.readFile(silkOutPath);
    if (!buffer.length) {
      throw new Error("silk encoder produced empty output");
    }

    return { buffer, durationMs };
  } catch (err) {
    logger.warn?.(`gewe voice convert failed: ${String(err)}`);
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function normalizeThumbBuffer(params: {
  buffer: Buffer;
  contentType?: string;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const core = getGeweRuntime();
  const contentType = params.contentType?.split(";")[0]?.trim();
  if (
    params.buffer.byteLength <= LINK_THUMB_MAX_BYTES &&
    contentType &&
    contentType.startsWith("image/")
  ) {
    return { buffer: params.buffer, contentType };
  }

  let working = params.buffer;
  for (const maxSide of [LINK_THUMB_MAX_SIDE, 240, 200, 160]) {
    for (const quality of LINK_THUMB_QUALITY_STEPS) {
      const resized = await core.media.resizeToJpeg({
        buffer: working,
        maxSide,
        quality,
        withoutEnlargement: true,
      });
      if (resized.byteLength <= LINK_THUMB_MAX_BYTES) {
        return { buffer: resized, contentType: "image/jpeg" };
      }
      working = resized;
    }
  }

  return { buffer: working, contentType: "image/jpeg" };
}

async function loadThumbSource(params: {
  url: string;
}): Promise<{ buffer: Buffer; contentType?: string; fileName?: string }> {
  const core = getGeweRuntime();
  if (looksLikeHttpUrl(params.url)) {
    return await core.channel.media.fetchRemoteMedia({
      url: params.url,
      maxBytes: LINK_THUMB_FETCH_MAX_BYTES,
      filePathHint: params.url,
    });
  }

  const localPath = normalizeFileUrl(params.url);
  const stat = await fs.stat(localPath);
  if (!stat.isFile()) {
    throw new Error("thumbUrl is not a file");
  }
  if (stat.size > LINK_THUMB_FETCH_MAX_BYTES) {
    throw new Error("thumbUrl exceeds 2MB limit");
  }
  const buffer = await fs.readFile(localPath);
  const contentType = await core.media.detectMime({ buffer, filePath: localPath });
  return { buffer, contentType, fileName: path.basename(localPath) };
}

async function stageThumbBuffer(params: {
  account: ResolvedGeweAccount;
  buffer: Buffer;
  contentType?: string;
  fileName?: string;
}): Promise<string> {
  const core = getGeweRuntime();
  const publicBase = params.account.config.mediaPublicUrl?.trim();
  if (!publicBase) {
    throw new Error("mediaPublicUrl not configured (required for link thumbnails)");
  }

  const normalized = await normalizeThumbBuffer({
    buffer: params.buffer,
    contentType: params.contentType,
  });
  if (normalized.buffer.byteLength > LINK_THUMB_MAX_BYTES) {
    throw new Error("link thumbnail exceeds 50KB after resize");
  }

  const saved = await core.channel.media.saveMediaBuffer(
    normalized.buffer,
    normalized.contentType,
    "outbound",
    LINK_THUMB_MAX_BYTES,
    params.fileName,
  );
  return buildPublicUrl(publicBase, saved.id);
}

async function resolveLinkThumbUrl(params: {
  account: ResolvedGeweAccount;
  thumbUrl?: string;
}): Promise<string> {
  const core = getGeweRuntime();
  const logger = core.logging.getChildLogger({ channel: CHANNEL_ID, module: "thumb" });
  const fallbackBuffer = await fs.readFile(DEFAULT_LINK_THUMB_PATH);
  const fallbackUrl = await stageThumbBuffer({
    account: params.account,
    buffer: fallbackBuffer,
    contentType: "image/jpeg",
    fileName: "gewe-thumb.jpeg",
  });

  const raw = params.thumbUrl?.trim();
  if (!raw) return fallbackUrl;

  try {
    const source = await loadThumbSource({ url: raw });
    const normalized = await normalizeThumbBuffer({
      buffer: source.buffer,
      contentType: source.contentType,
    });
    if (normalized.buffer.byteLength > LINK_THUMB_MAX_BYTES) {
      return fallbackUrl;
    }
    return await stageThumbBuffer({
      account: params.account,
      buffer: normalized.buffer,
      contentType: normalized.contentType,
      fileName: source.fileName ?? "gewe-thumb.jpeg",
    });
  } catch (err) {
    logger.warn?.(`gewe link thumb fallback: ${String(err)}`);
    return fallbackUrl;
  }
}

async function stageMedia(params: {
  account: ResolvedGeweAccount;
  cfg: OpenClawConfig;
  mediaUrl: string;
  allowRemote: boolean;
}): Promise<ResolvedMedia> {
  const core = getGeweRuntime();
  const rawUrl = params.mediaUrl.trim();
  if (!rawUrl) throw new Error("mediaUrl is empty");

  if (looksLikeHttpUrl(rawUrl) && params.allowRemote) {
    const contentType = await core.media.detectMime({ filePath: rawUrl });
    const fileName = path.basename(new URL(rawUrl).pathname || "");
    return { publicUrl: rawUrl, contentType: contentType ?? undefined, fileName };
  }

  const publicBase = params.account.config.mediaPublicUrl?.trim();
  if (!publicBase) {
    throw new Error(
      "mediaPublicUrl not configured (required for local media or forced proxy)",
    );
  }

  const maxBytes = resolveMediaMaxBytes(params.account);
  let buffer: Buffer;
  let contentType: string | undefined;
  let fileName: string | undefined;

  if (looksLikeHttpUrl(rawUrl)) {
    const fetched = await core.channel.media.fetchRemoteMedia({
      url: rawUrl,
      maxBytes,
      filePathHint: rawUrl,
    });
    buffer = fetched.buffer;
    contentType = fetched.contentType ?? undefined;
    fileName = fetched.fileName;
  } else {
    const localPath = normalizeFileUrl(rawUrl);
    buffer = await fs.readFile(localPath);
    contentType = await core.media.detectMime({ buffer, filePath: localPath });
    fileName = path.basename(localPath);
  }

  const saved = await core.channel.media.saveMediaBuffer(
    buffer,
    contentType,
    "outbound",
    maxBytes,
    fileName,
  );
  const resolvedFileName = fileName || extractOriginalFilename(saved.path);
  let resolvedId = saved.id;
  let resolvedPath = saved.path;
  const desiredExt =
    extensionForMime(contentType ?? saved.contentType) ||
    path.extname(resolvedFileName);
  if (desiredExt && !path.extname(resolvedId)) {
    const nextId = `${resolvedId}${desiredExt}`;
    const nextPath = path.join(path.dirname(saved.path), nextId);
    await fs.rename(saved.path, nextPath).catch(() => {});
    resolvedId = nextId;
    resolvedPath = nextPath;
  }
  return {
    publicUrl: buildPublicUrl(publicBase, resolvedId),
    contentType: contentType ?? saved.contentType,
    fileName: resolvedFileName || resolvedId,
    localPath: resolvedPath,
  };
}

async function resolvePublicUrl(params: {
  account: ResolvedGeweAccount;
  cfg: OpenClawConfig;
  url: string;
  allowRemote: boolean;
}): Promise<string> {
  const staged = await stageMedia({
    account: params.account,
    cfg: params.cfg,
    mediaUrl: params.url,
    allowRemote: params.allowRemote,
  });
  return staged.publicUrl;
}

export async function deliverGewePayload(params: {
  payload: ReplyPayload;
  account: ResolvedGeweAccount;
  cfg: OpenClawConfig;
  toWxid: string;
  statusSink?: (patch: { lastOutboundAt?: number }) => void;
}): Promise<GeweSendResult | null> {
  const { payload, account, cfg, toWxid, statusSink } = params;
  const core = getGeweRuntime();
  const geweData = resolveGeweData(payload);

  const trimmedText = payload.text?.trim() ?? "";
  const mediaUrl =
    payload.mediaUrl?.trim() || payload.mediaUrls?.[0]?.trim() || "";

  if (geweData?.link) {
    const link = geweData.link;
    const thumbUrl = await resolveLinkThumbUrl({
      account,
      thumbUrl: link.thumbUrl,
    });
    const result = await sendLinkGewe({
      account,
      toWxid,
      title: link.title,
      desc: link.desc,
      linkUrl: link.linkUrl,
      thumbUrl,
    });
    core.channel.activity.record({
      channel: CHANNEL_ID,
      accountId: account.accountId,
      direction: "outbound",
    });
    statusSink?.({ lastOutboundAt: Date.now() });
    return result;
  }

  if (mediaUrl) {
    const audioAsVoice = payload.audioAsVoice === true;
    const forceFile = geweData?.forceFile === true;
    const ttsVoiceHint = !forceFile && looksLikeTtsVoiceMediaUrl(mediaUrl);
    const wantsVoice = !forceFile && (audioAsVoice || ttsVoiceHint);
    const staged = await stageMedia({
      account,
      cfg,
      mediaUrl,
      allowRemote: !wantsVoice,
    });
    const contentType = staged.contentType;
    const fileName = staged.fileName;
    const kind = core.media.mediaKindFromMime(contentType);

    if (wantsVoice && kind === "audio") {
      const declaredDuration = resolveVoiceDurationMs(geweData);
      if (isSilkAudio({ contentType, fileName })) {
        if (declaredDuration) {
          const result = await sendVoiceGewe({
            account,
            toWxid,
            voiceUrl: staged.publicUrl,
            voiceDuration: declaredDuration,
          });
          core.channel.activity.record({
            channel: CHANNEL_ID,
            accountId: account.accountId,
            direction: "outbound",
          });
          statusSink?.({ lastOutboundAt: Date.now() });
          return result;
        }
      } else if (staged.localPath) {
        const converted = await convertAudioToSilk({
          account,
          sourcePath: staged.localPath,
        });
        if (converted) {
          const voiceDuration = declaredDuration ?? converted.durationMs;
          const publicBase = account.config.mediaPublicUrl?.trim();
          if (!publicBase) {
            throw new Error("mediaPublicUrl not configured (required for silk voice)");
          }
          const saved = await core.channel.media.saveMediaBuffer(
            converted.buffer,
            "audio/silk",
            "outbound",
            resolveMediaMaxBytes(account),
            "voice.silk",
          );
          const result = await sendVoiceGewe({
            account,
            toWxid,
            voiceUrl: buildPublicUrl(publicBase, saved.id),
            voiceDuration,
          });
          core.channel.activity.record({
            channel: CHANNEL_ID,
            accountId: account.accountId,
            direction: "outbound",
          });
          statusSink?.({ lastOutboundAt: Date.now() });
          return result;
        }
      }
    }

    if (!forceFile && kind === "image") {
      const result = await sendImageGewe({
        account,
        toWxid,
        imgUrl: staged.publicUrl,
      });
      core.channel.activity.record({
        channel: CHANNEL_ID,
        accountId: account.accountId,
        direction: "outbound",
      });
      statusSink?.({ lastOutboundAt: Date.now() });
      return result;
    }

    if (!forceFile && kind === "video") {
      const logger = core.logging.getChildLogger({ channel: CHANNEL_ID, module: "video" });
      const video = geweData?.video;
      let thumbUrl = video?.thumbUrl;
      const fallbackThumbUrl = account.config.videoThumbUrl?.trim() || undefined;
      let videoDuration =
        typeof video?.videoDuration === "number" ? Math.floor(video.videoDuration) : undefined;
      let stagedVideo = staged;

      if ((!thumbUrl || typeof videoDuration !== "number") && !stagedVideo.localPath) {
        try {
          stagedVideo = await stageMedia({
            account,
            cfg,
            mediaUrl,
            allowRemote: false,
          });
        } catch {
          // ignore; we'll fall back to file send below
        }
      }

      if (typeof videoDuration !== "number" && stagedVideo.localPath) {
        const probed = await probeVideoDurationSeconds({
          account,
          sourcePath: stagedVideo.localPath,
        });
        if (typeof probed === "number") {
          videoDuration = probed;
        }
      }

      if (!thumbUrl && stagedVideo.localPath) {
        const buffer = await generateVideoThumbBuffer({
          account,
          sourcePath: stagedVideo.localPath,
        });
        if (buffer) {
          const normalized = await normalizeThumbBuffer({
            buffer,
            contentType: "image/png",
          });
          if (normalized.buffer.byteLength <= LINK_THUMB_MAX_BYTES) {
            thumbUrl = await stageThumbBuffer({
              account,
              buffer: normalized.buffer,
              contentType: normalized.contentType,
              fileName: "gewe-video-thumb.png",
            });
          }
        }
      }

      if (!thumbUrl && fallbackThumbUrl) {
        thumbUrl = fallbackThumbUrl;
      }

      if (thumbUrl && typeof videoDuration === "number") {
        const thumbPublicUrl = await resolvePublicUrl({
          account,
          cfg,
          url: thumbUrl,
          allowRemote: true,
        });
        try {
          const result = await sendVideoGewe({
            account,
            toWxid,
            videoUrl: stagedVideo.publicUrl,
            thumbUrl: thumbPublicUrl,
            videoDuration: Math.floor(videoDuration),
          });
          core.channel.activity.record({
            channel: CHANNEL_ID,
            accountId: account.accountId,
            direction: "outbound",
          });
          statusSink?.({ lastOutboundAt: Date.now() });
          return result;
        } catch (err) {
          if (fallbackThumbUrl && fallbackThumbUrl !== thumbUrl) {
            logger.warn?.(
              `gewe video send failed with primary thumb, retrying fallback: ${String(err)}`,
            );
            const fallbackPublicUrl = await resolvePublicUrl({
              account,
              cfg,
              url: fallbackThumbUrl,
              allowRemote: true,
            });
            const result = await sendVideoGewe({
              account,
              toWxid,
              videoUrl: stagedVideo.publicUrl,
              thumbUrl: fallbackPublicUrl,
              videoDuration: Math.floor(videoDuration),
            });
            core.channel.activity.record({
              channel: CHANNEL_ID,
              accountId: account.accountId,
              direction: "outbound",
            });
            statusSink?.({ lastOutboundAt: Date.now() });
            return result;
          }
          throw err;
        }
      }
    }

    const fallbackName =
      geweData?.fileName ||
      fileName ||
      (contentType ? `file${contentType.includes("/") ? `.${contentType.split("/")[1]}` : ""}` : "file");
    const result = await sendFileGewe({
      account,
      toWxid,
      fileUrl: staged.publicUrl,
      fileName: fallbackName,
    });
    core.channel.activity.record({
      channel: CHANNEL_ID,
      accountId: account.accountId,
      direction: "outbound",
    });
    statusSink?.({ lastOutboundAt: Date.now() });
    return result;
  }

  if (trimmedText) {
    const tableMode = core.channel.text.resolveMarkdownTableMode({
      cfg,
      channel: CHANNEL_ID,
      accountId: account.accountId,
    });
    const content = core.channel.text.convertMarkdownTables(trimmedText, tableMode);
    const result = await sendTextGewe({
      account,
      toWxid,
      content,
      ats: geweData?.ats,
    });
    core.channel.activity.record({
      channel: CHANNEL_ID,
      accountId: account.accountId,
      direction: "outbound",
    });
    statusSink?.({ lastOutboundAt: Date.now() });
    return result;
  }

  return null;
}

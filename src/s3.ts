import { randomUUID } from "node:crypto";
import path from "node:path";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { extensionForMime } from "./openclaw-compat.js";

import type { GeweAccountConfig } from "./types.js";

const DEFAULT_S3_KEY_PREFIX = "gewe-openclaw/outbound";
const DEFAULT_PRESIGN_EXPIRES_SEC = 3600;

export type ResolvedS3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  forcePathStyle: boolean;
  publicBaseUrl?: string;
  keyPrefix: string;
  urlMode: "public" | "presigned";
  presignExpiresSec: number;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizePrefix(value?: string): string {
  const raw = value?.trim() || DEFAULT_S3_KEY_PREFIX;
  return raw.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function resolveS3Config(config: GeweAccountConfig): ResolvedS3Config | null {
  if (config.s3Enabled !== true) return null;
  const endpoint = config.s3Endpoint?.trim();
  const region = config.s3Region?.trim();
  const bucket = config.s3Bucket?.trim();
  const accessKeyId = config.s3AccessKeyId?.trim();
  const secretAccessKey = config.s3SecretAccessKey?.trim();
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("s3Enabled=true but S3 credentials or endpoint is incomplete");
  }
  const urlMode = config.s3UrlMode ?? "public";
  const publicBaseUrl = config.s3PublicBaseUrl?.trim();
  if (urlMode === "public" && !publicBaseUrl) {
    throw new Error("s3PublicBaseUrl is required when s3UrlMode=public");
  }
  return {
    endpoint: trimTrailingSlash(endpoint),
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken: config.s3SessionToken?.trim() || undefined,
    forcePathStyle: config.s3ForcePathStyle === true,
    publicBaseUrl: publicBaseUrl ? trimTrailingSlash(publicBaseUrl) : undefined,
    keyPrefix: normalizePrefix(config.s3KeyPrefix),
    urlMode,
    presignExpiresSec:
      config.s3PresignExpiresSec && config.s3PresignExpiresSec > 0
        ? Math.floor(config.s3PresignExpiresSec)
        : DEFAULT_PRESIGN_EXPIRES_SEC,
  };
}

function createClient(config: ResolvedS3Config): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
    },
  });
}

function inferExtension(fileName?: string, contentType?: string): string {
  const byName = fileName ? path.extname(fileName).toLowerCase() : "";
  if (byName) return byName;
  const byMime = contentType ? extensionForMime(contentType) : "";
  return byMime || "";
}

export function buildS3ObjectKey(params: {
  accountId: string;
  config: ResolvedS3Config;
  fileName?: string;
  contentType?: string;
}): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const ext = inferExtension(params.fileName, params.contentType);
  return [
    params.config.keyPrefix,
    params.accountId,
    yyyy,
    mm,
    dd,
    `${randomUUID()}${ext}`,
  ].join("/");
}

function buildPublicUrl(config: ResolvedS3Config, key: string): string {
  if (!config.publicBaseUrl) {
    throw new Error("s3PublicBaseUrl missing");
  }
  return `${config.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function uploadToS3(params: {
  config: ResolvedS3Config;
  accountId: string;
  buffer: Buffer;
  contentType?: string;
  fileName?: string;
}): Promise<{ key: string; url: string }> {
  const key = buildS3ObjectKey({
    accountId: params.accountId,
    config: params.config,
    fileName: params.fileName,
    contentType: params.contentType,
  });
  const client = createClient(params.config);
  const put = new PutObjectCommand({
    Bucket: params.config.bucket,
    Key: key,
    Body: params.buffer,
    ...(params.contentType ? { ContentType: params.contentType } : {}),
  });
  await client.send(put);
  if (params.config.urlMode === "public") {
    return { key, url: buildPublicUrl(params.config, key) };
  }
  const getCommand = new GetObjectCommand({
    Bucket: params.config.bucket,
    Key: key,
  });
  const url = await getSignedUrl(client, getCommand, {
    expiresIn: params.config.presignExpiresSec,
  });
  return { key, url };
}

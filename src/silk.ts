import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { ResolvedGeweAccount } from "./types.js";
import { getGeweRuntime } from "./runtime.js";
import { CHANNEL_ID } from "./constants.js";

const DEFAULT_SILK_VERSION = "latest";
const DEFAULT_SILK_BASE_URL =
  "https://github.com/Wangnov/rust-silk/releases/download";
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;
const DEFAULT_EXTRACT_TIMEOUT_MS = 60_000;

type RustSilkAsset = {
  name: string;
  archive: "tar.xz" | "zip";
  binary: string;
};

type ResolvedVersion = {
  tag: string;
  folder: string;
  isLatest: boolean;
  resolvedTag?: string;
};

const installCache = new Map<string, Promise<string | null>>();
const resolvedPathCache = new Map<string, string | null>();

export function buildRustSilkEncodeArgs(params: {
  input: string;
  output: string;
  sampleRate: number;
  tencent?: boolean;
}): string[] {
  const args = [
    "encode",
    "-i",
    params.input,
    "-o",
    params.output,
    "--sample-rate",
    String(params.sampleRate),
    "--quiet",
  ];
  if (params.tencent ?? true) {
    args.push("--tencent");
  }
  return args;
}

export function buildRustSilkDecodeArgs(params: {
  input: string;
  output: string;
  sampleRate: number;
  wav?: boolean;
}): string[] {
  const args = [
    "decode",
    "-i",
    params.input,
    "-o",
    params.output,
    "--sample-rate",
    String(params.sampleRate),
    "--quiet",
  ];
  if (params.wav) args.push("--wav");
  return args;
}

export async function ensureRustSilkBinary(
  account: ResolvedGeweAccount,
): Promise<string | null> {
  if (account.config.silkAutoDownload === false) return null;

  const asset = resolveRustSilkAsset(process.platform, process.arch);
  if (!asset) return null;

  const versionInput = account.config.silkVersion?.trim() || DEFAULT_SILK_VERSION;
  const baseUrl = account.config.silkBaseUrl?.trim() || DEFAULT_SILK_BASE_URL;
  const resolved = await resolveRequestedVersion(versionInput, baseUrl);
  const { tag, folder } = resolved;
  const cacheKey = [
    baseUrl,
    tag,
    folder,
    asset.name,
    process.platform,
    process.arch,
  ].join("|");

  if (resolvedPathCache.has(cacheKey)) {
    return resolvedPathCache.get(cacheKey) ?? null;
  }

  if (installCache.has(cacheKey)) {
    return installCache.get(cacheKey) ?? null;
  }

  const installPromise = installRustSilk({
    account,
    asset,
    baseUrl,
    tag,
    folder,
    isLatest: resolved.isLatest,
    resolvedTag: resolved.resolvedTag,
  })
    .then((result) => {
      resolvedPathCache.set(cacheKey, result);
      return result;
    })
    .finally(() => {
      installCache.delete(cacheKey);
    });
  installCache.set(cacheKey, installPromise);
  return installPromise;
}

async function installRustSilk(params: {
  account: ResolvedGeweAccount;
  asset: RustSilkAsset;
  baseUrl: string;
  tag: string;
  folder: string;
  isLatest: boolean;
  resolvedTag?: string;
}): Promise<string | null> {
  const core = getGeweRuntime();
  const logger = core.logging.getChildLogger({ channel: CHANNEL_ID, module: "silk" });
  const customInstall = params.account.config.silkInstallDir?.trim();
  const installRoot = customInstall
    ? resolveUserPath(customInstall)
    : path.join(resolveConfigDir(), "tools", "rust-silk");
  const installDir = path.join(installRoot, params.folder);
  const binaryPath = path.join(installDir, params.asset.binary);

  if (existsSync(binaryPath)) {
    if (params.isLatest && params.folder !== "latest") {
      await cleanupOldVersions(installRoot, params.folder);
    }
    return binaryPath;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-gewe-silk-"));
  try {
    const archivePath = path.join(tmpDir, params.asset.name);
    const archiveUrl = `${params.baseUrl}/${params.tag}/${params.asset.name}`;
    await downloadFile(archiveUrl, archivePath);

    const expectedHash = await resolveChecksum({
      account: params.account,
      baseUrl: params.baseUrl,
      tag: params.tag,
      assetName: params.asset.name,
    });
    if (!expectedHash && params.account.config.silkAllowUnverified !== true) {
      throw new Error("missing checksum for rust-silk download");
    }
    if (expectedHash) {
      const actual = await sha256File(archivePath);
      if (actual !== expectedHash) {
        throw new Error(
          `checksum mismatch for ${params.asset.name}: expected ${expectedHash} got ${actual}`,
        );
      }
    }

    await extractArchive(core, archivePath, tmpDir, params.asset.archive);
    const extracted = await findBinary(tmpDir, params.asset.binary);
    if (!extracted) {
      throw new Error(`rust-silk binary not found in ${params.asset.name}`);
    }

    await fs.mkdir(installDir, { recursive: true });
    await fs.copyFile(extracted, binaryPath);
    await fs.chmod(binaryPath, 0o755).catch(() => {});
    await fs.writeFile(
      path.join(installDir, "install.json"),
      JSON.stringify(
        {
          version: params.folder,
          tag: params.tag,
          resolvedTag: params.resolvedTag ?? null,
          asset: params.asset.name,
          installedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
    if (params.isLatest && params.folder !== "latest") {
      await cleanupOldVersions(installRoot, params.folder);
    }
    return binaryPath;
  } catch (err) {
    logger.warn?.(`rust-silk install failed: ${String(err)}`);
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function resolveRequestedVersion(
  versionInput: string,
  baseUrl: string,
): Promise<ResolvedVersion> {
  const trimmed = versionInput.trim();
  if (!trimmed || trimmed === "latest") {
    const latestTag = await resolveLatestTag(baseUrl).catch(() => null);
    if (latestTag) {
      const folder = latestTag.startsWith("v") ? latestTag.slice(1) : latestTag;
      return {
        tag: latestTag,
        folder,
        isLatest: true,
        resolvedTag: latestTag,
      };
    }
    return { tag: "latest", folder: "latest", isLatest: true };
  }
  const { tag, folder } = normalizeVersion(trimmed);
  return { tag, folder, isLatest: false };
}

function normalizeVersion(version: string): { tag: string; folder: string } {
  const trimmed = version.trim();
  const tag = trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
  const folder = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  return { tag, folder };
}

async function resolveLatestTag(baseUrl: string): Promise<string | null> {
  const repoUrl = deriveRepoUrl(baseUrl);
  if (!repoUrl) return null;
  const response = await fetchWithTimeout(
    `${repoUrl}/releases/latest`,
    DEFAULT_DOWNLOAD_TIMEOUT_MS,
  );
  const finalUrl = response.url || "";
  const match = finalUrl.match(/\/tag\/([^/?#]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

function deriveRepoUrl(baseUrl: string): string | null {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const match = trimmed.match(
    /^(https?:\/\/github\.com\/[^/]+\/[^/]+)(?:\/releases\/download)?$/i,
  );
  if (match) return match[1];
  return null;
}

function resolveRustSilkAsset(
  platform: NodeJS.Platform,
  arch: string,
): RustSilkAsset | null {
  if (platform === "darwin" && arch === "arm64") {
    return {
      name: "rust-silk-aarch64-apple-darwin.tar.xz",
      archive: "tar.xz",
      binary: "rust-silk",
    };
  }
  if (platform === "darwin" && (arch === "x64" || arch === "amd64")) {
    return {
      name: "rust-silk-x86_64-apple-darwin.tar.xz",
      archive: "tar.xz",
      binary: "rust-silk",
    };
  }
  if (platform === "linux" && arch === "arm64") {
    return {
      name: "rust-silk-aarch64-unknown-linux-gnu.tar.xz",
      archive: "tar.xz",
      binary: "rust-silk",
    };
  }
  if (platform === "linux" && (arch === "x64" || arch === "amd64")) {
    return {
      name: "rust-silk-x86_64-unknown-linux-gnu.tar.xz",
      archive: "tar.xz",
      binary: "rust-silk",
    };
  }
  if (platform === "win32" && (arch === "x64" || arch === "amd64")) {
    return {
      name: "rust-silk-x86_64-pc-windows-msvc.zip",
      archive: "zip",
      binary: "rust-silk.exe",
    };
  }
  return null;
}

async function resolveChecksum(params: {
  account: ResolvedGeweAccount;
  baseUrl: string;
  tag: string;
  assetName: string;
}): Promise<string | null> {
  if (params.account.config.silkSha256?.trim()) {
    return params.account.config.silkSha256.trim().toLowerCase();
  }

  const sumUrl = `${params.baseUrl}/${params.tag}/sha256.sum`;
  const sum = await fetchText(sumUrl).catch(() => "");
  if (sum) {
    const parsed = parseChecksum(sum, params.assetName);
    if (parsed) return parsed;
  }

  const assetSumUrl = `${params.baseUrl}/${params.tag}/${params.assetName}.sha256`;
  const assetSum = await fetchText(assetSumUrl).catch(() => "");
  if (assetSum) {
    const parsed = parseChecksum(assetSum, params.assetName);
    if (parsed) return parsed;
    const fallback = assetSum.trim().split(/\s+/)[0];
    if (/^[a-f0-9]{64}$/i.test(fallback)) return fallback.toLowerCase();
  }

  return null;
}

function parseChecksum(contents: string, assetName: string): string | null {
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (!match) continue;
    const [, hash, name] = match;
    if (name.trim() === assetName) return hash.toLowerCase();
  }
  return null;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetchWithTimeout(url, DEFAULT_DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("download failed: empty response body");
  }
  const stream = Readable.fromWeb(response.body as unknown as ReadableStream);
  await pipeline(stream, createWriteStream(dest));
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchWithTimeout(url, DEFAULT_DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const fileStream = createReadStream(filePath);
  for await (const chunk of fileStream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function extractArchive(
  core: ReturnType<typeof getGeweRuntime>,
  archivePath: string,
  destDir: string,
  archiveType: RustSilkAsset["archive"],
): Promise<void> {
  const args =
    archiveType === "zip"
      ? ["-xf", archivePath, "-C", destDir]
      : ["-xJf", archivePath, "-C", destDir];
  let result = await core.system.runCommandWithTimeout(["tar", ...args], {
    timeoutMs: DEFAULT_EXTRACT_TIMEOUT_MS,
  });
  if (result.code === 0) return;

  if (archiveType === "zip") {
    result = await core.system.runCommandWithTimeout(
      ["powershell", "-Command", `Expand-Archive -Path "${archivePath}" -DestinationPath "${destDir}" -Force`],
      { timeoutMs: DEFAULT_EXTRACT_TIMEOUT_MS },
    );
    if (result.code === 0) return;
  }

  throw new Error(result.stderr.trim() || `extract failed with code ${result.code ?? "?"}`);
}

async function findBinary(root: string, fileName: string): Promise<string | null> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const nested = await findBinary(fullPath, fileName);
      if (nested) return nested;
    }
  }
  return null;
}

async function cleanupOldVersions(
  installRoot: string,
  keepFolder: string,
): Promise<void> {
  const entries = await fs.readdir(installRoot, { withFileTypes: true }).catch(() => []);
  const tasks: Promise<void>[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === keepFolder) continue;
    const fullPath = path.join(installRoot, entry.name);
    tasks.push(fs.rm(fullPath, { recursive: true, force: true }).then(() => {}));
  }
  if (tasks.length) await Promise.all(tasks);
}

function resolveConfigDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const override = env.OPENCLAW_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
  if (override) return resolveUserPath(override);
  const legacyDirs = [".clawdbot", ".moltbot", ".moldbot"].map((dir) =>
    path.join(homedir(), dir),
  );
  const newDir = path.join(homedir(), ".openclaw");
  try {
    if (existsSync(newDir)) return newDir;
    const existingLegacy = legacyDirs.find((dir) => {
      try {
        return existsSync(dir);
      } catch {
        return false;
      }
    });
    if (existingLegacy) return existingLegacy;
  } catch {
    // best-effort
  }
  return newDir;
}

function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, os.homedir());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
}

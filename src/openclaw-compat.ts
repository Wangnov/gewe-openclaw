import type {
  ChannelConfigSchema,
  ChannelPlugin,
  ChannelSetupInput,
  OpenClawConfig,
  OpenClawPluginApi,
  PluginRuntime,
  ReplyPayload,
  RuntimeEnv,
  WizardPrompter,
} from "openclaw/plugin-sdk";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { z, type RefinementCtx, type ZodTypeAny } from "zod";

export type {
  ChannelPlugin,
  ChannelSetupInput,
  OpenClawConfig,
  OpenClawPluginApi,
  PluginRuntime,
  ReplyPayload,
  RuntimeEnv,
  WizardPrompter,
};

export const DEFAULT_ACCOUNT_ID = "default";
export const DEFAULT_WEBHOOK_MAX_BODY_BYTES = 1024 * 1024;
export const DEFAULT_WEBHOOK_BODY_TIMEOUT_MS = 30_000;

const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const VALID_ACCOUNT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_ACCOUNT_ID_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;
const NORMALIZE_ACCOUNT_ID_CACHE_MAX = 512;
const normalizeAccountIdCache = new Map<string, string>();

function setNormalizeCache<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.set(key, value);
  if (cache.size <= NORMALIZE_ACCOUNT_ID_CACHE_MAX) {
    return;
  }
  const oldest = cache.keys().next();
  if (!oldest.done) {
    cache.delete(oldest.value);
  }
}

function canonicalizeAccountId(value: string): string {
  if (VALID_ACCOUNT_ID_RE.test(value)) {
    return value.toLowerCase();
  }
  return value
    .toLowerCase()
    .replace(INVALID_ACCOUNT_ID_CHARS_RE, "-")
    .replace(LEADING_DASH_RE, "")
    .replace(TRAILING_DASH_RE, "")
    .slice(0, 64);
}

export function normalizeAccountId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_ACCOUNT_ID;
  }
  const cached = normalizeAccountIdCache.get(trimmed);
  if (cached) {
    return cached;
  }
  const canonical = canonicalizeAccountId(trimmed);
  const normalized = canonical && !BLOCKED_OBJECT_KEYS.has(canonical) ? canonical : DEFAULT_ACCOUNT_ID;
  setNormalizeCache(normalizeAccountIdCache, trimmed, normalized);
  return normalized;
}

export type AllowlistMatchSource =
  | "wildcard"
  | "id"
  | "name"
  | "tag"
  | "username"
  | "prefixed-id"
  | "prefixed-user"
  | "prefixed-name"
  | "slug"
  | "localpart";

export type AllowlistMatch<TSource extends string = AllowlistMatchSource> = {
  allowed: boolean;
  matchKey?: string;
  matchSource?: TSource;
};

export type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";
export type GroupPolicy = "open" | "disabled" | "allowlist";

export type DmConfig = {
  historyLimit?: number;
};

export type GroupToolPolicyConfig = {
  allow?: string[];
  alsoAllow?: string[];
  deny?: string[];
};

export type BlockStreamingCoalesceConfig = {
  minChars?: number;
  maxChars?: number;
  idleMs?: number;
};

export type ChannelGroupContext = {
  cfg: OpenClawConfig;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  accountId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
};

type ZodSchemaWithToJsonSchema = ZodTypeAny & {
  toJSONSchema?: (params?: Record<string, unknown>) => unknown;
};

type ChannelSection = {
  accounts?: Record<string, Record<string, unknown>>;
  enabled?: boolean;
  name?: string;
};

function channelHasAccounts(cfg: OpenClawConfig, channelKey: string): boolean {
  const channels = cfg.channels as Record<string, unknown> | undefined;
  const base = channels?.[channelKey] as ChannelSection | undefined;
  return Boolean(base?.accounts && Object.keys(base.accounts).length > 0);
}

function shouldStoreNameInAccounts(params: {
  cfg: OpenClawConfig;
  channelKey: string;
  accountId: string;
  alwaysUseAccounts?: boolean;
}): boolean {
  if (params.alwaysUseAccounts) {
    return true;
  }
  if (params.accountId !== DEFAULT_ACCOUNT_ID) {
    return true;
  }
  return channelHasAccounts(params.cfg, params.channelKey);
}

export function applyAccountNameToChannelSection(params: {
  cfg: OpenClawConfig;
  channelKey: string;
  accountId: string;
  name?: string;
  alwaysUseAccounts?: boolean;
}): OpenClawConfig {
  const trimmed = params.name?.trim();
  if (!trimmed) {
    return params.cfg;
  }
  const accountId = normalizeAccountId(params.accountId);
  const channels = params.cfg.channels as Record<string, unknown> | undefined;
  const baseConfig = channels?.[params.channelKey];
  const base =
    typeof baseConfig === "object" && baseConfig ? (baseConfig as ChannelSection) : undefined;
  const useAccounts = shouldStoreNameInAccounts({
    cfg: params.cfg,
    channelKey: params.channelKey,
    accountId,
    alwaysUseAccounts: params.alwaysUseAccounts,
  });
  if (!useAccounts && accountId === DEFAULT_ACCOUNT_ID) {
    const safeBase = base ?? {};
    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        [params.channelKey]: {
          ...safeBase,
          name: trimmed,
        },
      },
    } as OpenClawConfig;
  }

  const baseAccounts: Record<string, Record<string, unknown>> = base?.accounts ?? {};
  const existingAccount = baseAccounts[accountId] ?? {};
  const baseWithoutName =
    accountId === DEFAULT_ACCOUNT_ID
      ? (({ name: _ignored, ...rest }) => rest)(base ?? {})
      : (base ?? {});

  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      [params.channelKey]: {
        ...baseWithoutName,
        accounts: {
          ...baseAccounts,
          [accountId]: {
            ...existingAccount,
            name: trimmed,
          },
        },
      },
    },
  } as OpenClawConfig;
}

export function setAccountEnabledInConfigSection(params: {
  cfg: OpenClawConfig;
  sectionKey: string;
  accountId: string;
  enabled: boolean;
  allowTopLevel?: boolean;
}): OpenClawConfig {
  const accountKey = params.accountId || DEFAULT_ACCOUNT_ID;
  const channels = params.cfg.channels as Record<string, unknown> | undefined;
  const base = channels?.[params.sectionKey] as ChannelSection | undefined;
  const hasAccounts = Boolean(base?.accounts);

  if (params.allowTopLevel && accountKey === DEFAULT_ACCOUNT_ID && !hasAccounts) {
    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        [params.sectionKey]: {
          ...base,
          enabled: params.enabled,
        },
      },
    } as OpenClawConfig;
  }

  const baseAccounts = base?.accounts ?? {};
  const existing = baseAccounts[accountKey] ?? {};
  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      [params.sectionKey]: {
        ...base,
        accounts: {
          ...baseAccounts,
          [accountKey]: {
            ...existing,
            enabled: params.enabled,
          },
        },
      },
    },
  } as OpenClawConfig;
}

export function deleteAccountFromConfigSection(params: {
  cfg: OpenClawConfig;
  sectionKey: string;
  accountId: string;
  clearBaseFields?: string[];
}): OpenClawConfig {
  const accountKey = params.accountId || DEFAULT_ACCOUNT_ID;
  const channels = params.cfg.channels as Record<string, unknown> | undefined;
  const base = channels?.[params.sectionKey] as ChannelSection | undefined;
  if (!base) {
    return params.cfg;
  }

  const baseAccounts =
    base.accounts && typeof base.accounts === "object" ? { ...base.accounts } : undefined;

  if (accountKey !== DEFAULT_ACCOUNT_ID) {
    const accounts = baseAccounts ? { ...baseAccounts } : {};
    delete accounts[accountKey];
    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        [params.sectionKey]: {
          ...base,
          accounts: Object.keys(accounts).length ? accounts : undefined,
        },
      },
    } as OpenClawConfig;
  }

  if (baseAccounts && Object.keys(baseAccounts).length > 0) {
    delete baseAccounts[accountKey];
    const baseRecord = { ...(base as Record<string, unknown>) };
    for (const field of params.clearBaseFields ?? []) {
      if (field in baseRecord) {
        baseRecord[field] = undefined;
      }
    }
    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        [params.sectionKey]: {
          ...baseRecord,
          accounts: Object.keys(baseAccounts).length ? baseAccounts : undefined,
        },
      },
    } as OpenClawConfig;
  }

  const nextChannels = { ...params.cfg.channels } as Record<string, unknown>;
  delete nextChannels[params.sectionKey];
  const nextCfg = { ...params.cfg } as OpenClawConfig;
  if (Object.keys(nextChannels).length > 0) {
    nextCfg.channels = nextChannels as OpenClawConfig["channels"];
  } else {
    delete nextCfg.channels;
  }
  return nextCfg;
}

export function mapAllowFromEntries(
  allowFrom: Array<string | number> | null | undefined,
): string[] {
  return (allowFrom ?? []).map((entry) => String(entry));
}

type ChannelMatchSource = "direct" | "parent" | "wildcard";

type ChannelEntryMatch<T> = {
  entry?: T;
  key?: string;
  wildcardEntry?: T;
  wildcardKey?: string;
  parentEntry?: T;
  parentKey?: string;
  matchKey?: string;
  matchSource?: ChannelMatchSource;
};

export function normalizeChannelSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildChannelKeyCandidates(...keys: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const key of keys) {
    if (typeof key !== "string") {
      continue;
    }
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    candidates.push(trimmed);
  }
  return candidates;
}

function resolveChannelEntryMatch<T>(params: {
  entries?: Record<string, T>;
  keys: string[];
  wildcardKey?: string;
}): ChannelEntryMatch<T> {
  const entries = params.entries ?? {};
  const match: ChannelEntryMatch<T> = {};
  for (const key of params.keys) {
    if (!Object.prototype.hasOwnProperty.call(entries, key)) {
      continue;
    }
    match.entry = entries[key];
    match.key = key;
    break;
  }
  if (params.wildcardKey && Object.prototype.hasOwnProperty.call(entries, params.wildcardKey)) {
    match.wildcardEntry = entries[params.wildcardKey];
    match.wildcardKey = params.wildcardKey;
  }
  return match;
}

export function resolveChannelEntryMatchWithFallback<T>(params: {
  entries?: Record<string, T>;
  keys: string[];
  parentKeys?: string[];
  wildcardKey?: string;
  normalizeKey?: (value: string) => string;
}): ChannelEntryMatch<T> {
  const direct = resolveChannelEntryMatch({
    entries: params.entries,
    keys: params.keys,
    wildcardKey: params.wildcardKey,
  });

  if (direct.entry && direct.key) {
    return { ...direct, matchKey: direct.key, matchSource: "direct" };
  }

  const normalizeKey = params.normalizeKey;
  if (normalizeKey) {
    const normalizedKeys = params.keys.map((key) => normalizeKey(key)).filter(Boolean);
    if (normalizedKeys.length > 0) {
      for (const [entryKey, entry] of Object.entries(params.entries ?? {})) {
        const normalizedEntry = normalizeKey(entryKey);
        if (normalizedEntry && normalizedKeys.includes(normalizedEntry)) {
          return {
            ...direct,
            entry,
            key: entryKey,
            matchKey: entryKey,
            matchSource: "direct",
          };
        }
      }
    }
  }

  const parentKeys = params.parentKeys ?? [];
  if (parentKeys.length > 0) {
    const parent = resolveChannelEntryMatch({ entries: params.entries, keys: parentKeys });
    if (parent.entry && parent.key) {
      return {
        ...direct,
        entry: parent.entry,
        key: parent.key,
        parentEntry: parent.entry,
        parentKey: parent.key,
        matchKey: parent.key,
        matchSource: "parent",
      };
    }
    if (normalizeKey) {
      const normalizedParentKeys = parentKeys.map((key) => normalizeKey(key)).filter(Boolean);
      if (normalizedParentKeys.length > 0) {
        for (const [entryKey, entry] of Object.entries(params.entries ?? {})) {
          const normalizedEntry = normalizeKey(entryKey);
          if (normalizedEntry && normalizedParentKeys.includes(normalizedEntry)) {
            return {
              ...direct,
              entry,
              key: entryKey,
              parentEntry: entry,
              parentKey: entryKey,
              matchKey: entryKey,
              matchSource: "parent",
            };
          }
        }
      }
    }
  }

  if (direct.wildcardEntry && direct.wildcardKey) {
    return {
      ...direct,
      entry: direct.wildcardEntry,
      key: direct.wildcardKey,
      matchKey: direct.wildcardKey,
      matchSource: "wildcard",
    };
  }

  return direct;
}

export function resolveNestedAllowlistDecision(params: {
  outerConfigured: boolean;
  outerMatched: boolean;
  innerConfigured: boolean;
  innerMatched: boolean;
}): boolean {
  if (!params.outerConfigured) {
    return true;
  }
  if (!params.outerMatched) {
    return false;
  }
  if (!params.innerConfigured) {
    return true;
  }
  return params.innerMatched;
}

export function resolveMentionGatingWithBypass(params: {
  isGroup: boolean;
  requireMention: boolean;
  canDetectMention: boolean;
  wasMentioned: boolean;
  implicitMention?: boolean;
  hasAnyMention?: boolean;
  allowTextCommands: boolean;
  hasControlCommand: boolean;
  commandAuthorized: boolean;
}): { effectiveWasMentioned: boolean; shouldSkip: boolean; shouldBypassMention: boolean } {
  const shouldBypassMention =
    params.isGroup &&
    params.requireMention &&
    !params.wasMentioned &&
    !(params.hasAnyMention ?? false) &&
    params.allowTextCommands &&
    params.commandAuthorized &&
    params.hasControlCommand;
  const effectiveWasMentioned =
    params.wasMentioned || params.implicitMention === true || shouldBypassMention;
  return {
    effectiveWasMentioned,
    shouldSkip: params.requireMention && params.canDetectMention && !effectiveWasMentioned,
    shouldBypassMention,
  };
}

type CommandAuthorizer = {
  configured: boolean;
  allowed: boolean;
};

export function resolveControlCommandGate(params: {
  useAccessGroups: boolean;
  authorizers: CommandAuthorizer[];
  allowTextCommands: boolean;
  hasControlCommand: boolean;
  modeWhenAccessGroupsOff?: "allow" | "deny" | "configured";
}): { commandAuthorized: boolean; shouldBlock: boolean } {
  const mode = params.modeWhenAccessGroupsOff ?? "allow";
  let commandAuthorized = false;

  if (!params.useAccessGroups) {
    if (mode === "allow") {
      commandAuthorized = true;
    } else if (mode === "deny") {
      commandAuthorized = false;
    } else {
      const anyConfigured = params.authorizers.some((entry) => entry.configured);
      commandAuthorized = !anyConfigured
        ? true
        : params.authorizers.some((entry) => entry.configured && entry.allowed);
    }
  } else {
    commandAuthorized = params.authorizers.some((entry) => entry.configured && entry.allowed);
  }

  return {
    commandAuthorized,
    shouldBlock:
      params.allowTextCommands && params.hasControlCommand && !commandAuthorized,
  };
}

export function logInboundDrop(params: {
  log: (message: string) => void;
  channel: string;
  reason: string;
  target?: string;
}): void {
  const target = params.target ? ` target=${params.target}` : "";
  params.log(`${params.channel}: drop ${params.reason}${target}`);
}

export function buildChannelConfigSchema(schema: ZodTypeAny): ChannelConfigSchema {
  const jsonSchema = buildJsonSchema(schema);
  if (jsonSchema) {
    return {
      schema: jsonSchema,
    };
  }
  return {
    schema: {
      type: "object",
      additionalProperties: true,
    },
  };
}

export function buildJsonSchema(schema: unknown): Record<string, unknown> | null {
  const schemaWithJson = schema as ZodSchemaWithToJsonSchema | null | undefined;
  if (schemaWithJson && typeof schemaWithJson.toJSONSchema === "function") {
    return schemaWithJson.toJSONSchema({
      target: "draft-07",
      unrepresentable: "any",
    }) as Record<string, unknown>;
  }
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    return schema as Record<string, unknown>;
  }
  return null;
}

export const DmPolicySchema = z.enum(["pairing", "allowlist", "open", "disabled"]);
export const GroupPolicySchema = z.enum(["open", "disabled", "allowlist"]);

export const DmConfigSchema = z
  .object({
    historyLimit: z.number().int().min(0).optional(),
  })
  .strict();

export const BlockStreamingCoalesceSchema = z
  .object({
    minChars: z.number().int().positive().optional(),
    maxChars: z.number().int().positive().optional(),
    idleMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export const MarkdownConfigSchema = z
  .object({
    tables: z.enum(["off", "bullets", "code"]).optional(),
  })
  .strict()
  .optional();

export const ToolPolicySchema = z
  .object({
    allow: z.array(z.string()).optional(),
    alsoAllow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.allow && value.allow.length > 0 && value.alsoAllow && value.alsoAllow.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "tools policy cannot set both allow and alsoAllow in the same scope",
      });
    }
  });

function normalizeAllowFrom(values?: Array<string | number>): string[] {
  return (values ?? []).map((value) => String(value).trim()).filter(Boolean);
}

export function requireOpenAllowFrom(params: {
  policy?: string;
  allowFrom?: Array<string | number>;
  ctx: RefinementCtx;
  path: Array<string | number>;
  message: string;
}): void {
  if (params.policy !== "open") {
    return;
  }
  const allow = normalizeAllowFrom(params.allowFrom);
  if (allow.includes("*")) {
    return;
  }
  params.ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: params.path,
    message: params.message,
  });
}

export type AgentMediaPayload = {
  MediaPath?: string;
  MediaType?: string;
  MediaUrl?: string;
  MediaPaths?: string[];
  MediaUrls?: string[];
  MediaTypes?: string[];
};

export function buildAgentMediaPayload(
  mediaList: Array<{ path: string; contentType?: string | null }>,
): AgentMediaPayload {
  const first = mediaList[0];
  const mediaPaths = mediaList.map((media) => media.path);
  const mediaTypes = mediaList.map((media) => media.contentType).filter(Boolean) as string[];
  return {
    MediaPath: first?.path,
    MediaType: first?.contentType ?? undefined,
    MediaUrl: first?.path,
    MediaPaths: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaUrls: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
  };
}

export const PAIRING_APPROVED_MESSAGE =
  "✅ OpenClaw access approved. Send a message to start chatting.";

export function missingTargetError(provider: string, hint?: string): Error {
  const normalizedHint = hint?.trim();
  return new Error(
    `Delivering to ${provider} requires target${normalizedHint ? ` ${normalizedHint}` : ""}`,
  );
}

type RequestBodyLimitErrorCode =
  | "PAYLOAD_TOO_LARGE"
  | "REQUEST_BODY_TIMEOUT"
  | "CONNECTION_CLOSED";

const DEFAULT_REQUEST_BODY_ERROR_MESSAGE: Record<RequestBodyLimitErrorCode, string> = {
  PAYLOAD_TOO_LARGE: "PayloadTooLarge",
  REQUEST_BODY_TIMEOUT: "RequestBodyTimeout",
  CONNECTION_CLOSED: "RequestBodyConnectionClosed",
};

const DEFAULT_REQUEST_BODY_RESPONSE_MESSAGE: Record<RequestBodyLimitErrorCode, string> = {
  PAYLOAD_TOO_LARGE: "Payload too large",
  REQUEST_BODY_TIMEOUT: "Request body timeout",
  CONNECTION_CLOSED: "Connection closed",
};

class RequestBodyLimitError extends Error {
  readonly code: RequestBodyLimitErrorCode;

  constructor(code: RequestBodyLimitErrorCode, message?: string) {
    super(message ?? DEFAULT_REQUEST_BODY_ERROR_MESSAGE[code]);
    this.name = "RequestBodyLimitError";
    this.code = code;
  }
}

function isRequestBodyLimitError(error: unknown): error is RequestBodyLimitError {
  return error instanceof RequestBodyLimitError;
}

function requestBodyErrorToText(code: RequestBodyLimitErrorCode): string {
  return DEFAULT_REQUEST_BODY_RESPONSE_MESSAGE[code];
}

function parseContentLengthHeader(req: IncomingMessage): number | null {
  const header = req.headers["content-length"];
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== "string") {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

async function readRequestBodyWithLimit(
  req: IncomingMessage,
  options: { maxBytes: number; timeoutMs?: number; encoding?: BufferEncoding },
): Promise<string> {
  const maxBytes = Number.isFinite(options.maxBytes)
    ? Math.max(1, Math.floor(options.maxBytes))
    : 1;
  const timeoutMs =
    typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs)
      ? Math.max(1, Math.floor(options.timeoutMs))
      : DEFAULT_WEBHOOK_BODY_TIMEOUT_MS;
  const encoding = options.encoding ?? "utf-8";

  const declaredLength = parseContentLengthHeader(req);
  if (declaredLength !== null && declaredLength > maxBytes) {
    if (!req.destroyed) {
      req.destroy();
    }
    throw new RequestBodyLimitError("PAYLOAD_TOO_LARGE");
  }

  return await new Promise((resolve, reject) => {
    let done = false;
    let ended = false;
    let totalBytes = 0;
    const chunks: Buffer[] = [];

    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
      req.removeListener("close", onClose);
      clearTimeout(timer);
    };

    const finish = (cb: () => void) => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      cb();
    };

    const fail = (error: Error) => {
      finish(() => reject(error));
    };

    const timer = setTimeout(() => {
      if (!req.destroyed) {
        req.destroy();
      }
      fail(new RequestBodyLimitError("REQUEST_BODY_TIMEOUT"));
    }, timeoutMs);

    const onData = (chunk: Buffer | string) => {
      if (done) {
        return;
      }
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        if (!req.destroyed) {
          req.destroy();
        }
        fail(new RequestBodyLimitError("PAYLOAD_TOO_LARGE"));
        return;
      }
      chunks.push(buffer);
    };

    const onEnd = () => {
      ended = true;
      finish(() => resolve(Buffer.concat(chunks).toString(encoding)));
    };

    const onError = (error: Error) => {
      if (!done) {
        fail(error);
      }
    };

    const onClose = () => {
      if (!done && !ended) {
        fail(new RequestBodyLimitError("CONNECTION_CLOSED"));
      }
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("close", onClose);
  });
}

export async function readJsonBodyWithLimit(
  req: IncomingMessage,
  options: { maxBytes: number; timeoutMs?: number; emptyObjectOnEmpty?: boolean },
): Promise<
  | { ok: true; value: unknown; raw: string }
  | { ok: false; error: string; code: RequestBodyLimitErrorCode | "INVALID_JSON" }
> {
  try {
    const raw = await readRequestBodyWithLimit(req, options);
    const trimmed = raw.trim();
    if (!trimmed) {
      if (options.emptyObjectOnEmpty === false) {
        return { ok: false, code: "INVALID_JSON", error: "empty payload" };
      }
      return { ok: true, value: {}, raw: trimmed };
    }
    try {
      return { ok: true, value: JSON.parse(trimmed) as unknown, raw: trimmed };
    } catch (error) {
      return {
        ok: false,
        code: "INVALID_JSON",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } catch (error) {
    if (isRequestBodyLimitError(error)) {
      return { ok: false, code: error.code, error: requestBodyErrorToText(error.code) };
    }
    return {
      ok: false,
      code: "INVALID_JSON",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const EXT_BY_MIME: Record<string, string> = {
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/flac": ".flac",
  "audio/aac": ".aac",
  "audio/opus": ".opus",
  "audio/x-m4a": ".m4a",
  "audio/mp4": ".m4a",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "application/pdf": ".pdf",
  "application/json": ".json",
  "application/zip": ".zip",
  "application/gzip": ".gz",
  "application/x-tar": ".tar",
  "application/x-7z-compressed": ".7z",
  "application/vnd.rar": ".rar",
  "application/msword": ".doc",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/csv": ".csv",
  "text/plain": ".txt",
  "text/markdown": ".md",
};

const MIME_BY_EXT: Record<string, string> = {
  ...Object.fromEntries(Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime])),
  ".jpeg": "image/jpeg",
  ".js": "text/javascript",
};

function normalizeMimeType(mime?: string | null): string | undefined {
  if (!mime) {
    return undefined;
  }
  const cleaned = mime.split(";")[0]?.trim().toLowerCase();
  return cleaned || undefined;
}

function getFileExtension(filePath?: string | null): string | undefined {
  if (!filePath) {
    return undefined;
  }
  try {
    if (/^https?:\/\//i.test(filePath)) {
      const url = new URL(filePath);
      return path.extname(url.pathname).toLowerCase() || undefined;
    }
  } catch {
    // ignore malformed URLs and fall back to path parsing
  }
  const ext = path.extname(filePath).toLowerCase();
  return ext || undefined;
}

function detectMimeFromBuffer(buffer?: Buffer): string | undefined {
  if (!buffer || buffer.length < 4) {
    return undefined;
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.subarray(0, 4).toString("ascii") === "GIF8") {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp"
  ) {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand === "qt  ") {
      return "video/quicktime";
    }
    if (brand === "M4A " || brand === "M4B " || brand === "M4P ") {
      return "audio/mp4";
    }
    return "video/mp4";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return "audio/wav";
  }
  if (buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return "audio/ogg";
  }
  if (buffer.subarray(0, 4).toString("ascii") === "fLaC") {
    return "audio/flac";
  }
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") {
    return "audio/mpeg";
  }
  if (
    buffer.length >= 2 &&
    buffer[0] === 0xff &&
    (buffer[1] & 0xe0) === 0xe0
  ) {
    return "audio/mpeg";
  }
  if (
    buffer.length >= 2 &&
    buffer[0] === 0xff &&
    (buffer[1] === 0xf1 || buffer[1] === 0xf9)
  ) {
    return "audio/aac";
  }
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return "application/zip";
  }
  return undefined;
}

function isGenericMime(mime?: string): boolean {
  if (!mime) {
    return true;
  }
  const normalized = mime.toLowerCase();
  return normalized === "application/octet-stream" || normalized === "application/zip";
}

export async function detectMime(opts: {
  buffer?: Buffer;
  headerMime?: string | null;
  filePath?: string;
}): Promise<string | undefined> {
  const ext = getFileExtension(opts.filePath);
  const extMime = ext ? MIME_BY_EXT[ext] : undefined;
  const headerMime = normalizeMimeType(opts.headerMime);
  const sniffed = detectMimeFromBuffer(opts.buffer);

  if (sniffed && (!isGenericMime(sniffed) || !extMime)) {
    return sniffed;
  }
  if (extMime) {
    return extMime;
  }
  if (headerMime && !isGenericMime(headerMime)) {
    return headerMime;
  }
  if (sniffed) {
    return sniffed;
  }
  return headerMime;
}

export function extensionForMime(mime?: string | null): string | undefined {
  const normalized = normalizeMimeType(mime);
  if (!normalized) {
    return undefined;
  }
  return EXT_BY_MIME[normalized];
}

export function extractOriginalFilename(filePath: string): string {
  const basename = path.basename(filePath);
  if (!basename) {
    return "file.bin";
  }
  const ext = path.extname(basename);
  const nameWithoutExt = path.basename(basename, ext);
  const match = nameWithoutExt.match(
    /^(.+)---[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
  );
  if (match?.[1]) {
    return `${match[1]}${ext}`;
  }
  return basename;
}

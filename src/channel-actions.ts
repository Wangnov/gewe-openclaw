import { Type, type TSchema } from "@sinclair/typebox";
import type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelMessageToolSchemaContribution,
} from "openclaw/plugin-sdk/channel-runtime";

import { listEnabledGeweAccounts, resolveGeweAccount } from "./accounts.js";
import { deliverGewePayload } from "./delivery.js";
import { normalizeGeweMessagingTarget } from "./normalize.js";
import type { OpenClawConfig, ReplyPayload } from "./openclaw-compat.js";
import type { CoreConfig } from "./types.js";

type JsonResultDetails = Record<string, unknown>;
type JsonResult = {
  content: Array<{ type: "text"; text: string }>;
  details: JsonResultDetails;
};

type GeweActionScopedPayload = {
  quoteReply?: {
    svrid?: string;
    atWxid?: string;
    partialText?: {
      text?: string;
    };
  };
  emoji?: {
    emojiMd5?: string;
    emojiSize?: number;
  };
  nameCard?: {
    nickName?: string;
    nameCardWxid?: string;
  };
  miniApp?: {
    miniAppId?: string;
    displayName?: string;
    pagePath?: string;
    coverImgUrl?: string;
    title?: string;
    userName?: string;
  };
  forward?: {
    kind?: "image" | "video" | "file" | "link" | "miniApp";
    xml?: string;
    coverImgUrl?: string;
  };
  revoke?: {
    msgId?: string;
    newMsgId?: string;
    createTime?: string;
  };
};

const SUPPORTED_ACTIONS = new Set<ChannelMessageActionName>(["send", "reply", "unsend"]);

function jsonResult(details: JsonResultDetails): JsonResult {
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  };
}

function extractToolSend(args: Record<string, unknown>, expectedAction = "sendMessage") {
  const action = typeof args.action === "string" ? args.action.trim() : "";
  if (action !== expectedAction) {
    return null;
  }
  const to = typeof args.to === "string" ? args.to.trim() : "";
  if (!to) {
    return null;
  }
  const accountId = typeof args.accountId === "string" ? args.accountId.trim() : undefined;
  const threadIdRaw =
    typeof args.threadId === "string"
      ? args.threadId.trim()
      : typeof args.threadId === "number"
        ? String(args.threadId)
        : "";
  return {
    to,
    ...(accountId ? { accountId } : {}),
    ...(threadIdRaw ? { threadId: threadIdRaw } : {}),
  };
}

function optionalString(description: string): TSchema {
  return Type.Optional(Type.String({ description }));
}

function createGeweSchemaContribution(): ChannelMessageToolSchemaContribution[] {
  return [
    {
      properties: {
        messageId: optionalString("GeWe reply/unsend 目标消息 ID。reply 未显式提供时会回退到当前消息。"),
        newMessageId: optionalString("GeWe 撤回所需的 new message id。"),
        createTime: optionalString("GeWe 撤回所需的消息创建时间。"),
        gewe: Type.Optional(
          Type.Object(
            {
              quote: Type.Optional(
                Type.Object(
                  {
                    partialText: optionalString("GeWe 部分引用文本。"),
                    atWxid: optionalString("GeWe 引用回复里 @ 的目标 wxid。"),
                    atSender: Type.Optional(
                      Type.Boolean({
                        description: "在当前群会话里自动 @ 当前可信发言人。",
                      }),
                    ),
                  },
                  { additionalProperties: false },
                ),
              ),
              emoji: Type.Optional(
                Type.Object(
                  {
                    emojiMd5: optionalString("GeWe emoji md5。"),
                    emojiSize: Type.Optional(Type.Number()),
                  },
                  { additionalProperties: false },
                ),
              ),
              nameCard: Type.Optional(
                Type.Object(
                  {
                    nickName: optionalString("名片昵称。"),
                    nameCardWxid: optionalString("名片 wxid。"),
                  },
                  { additionalProperties: false },
                ),
              ),
              miniApp: Type.Optional(
                Type.Object(
                  {
                    miniAppId: optionalString("小程序 appId。"),
                    displayName: optionalString("小程序展示名。"),
                    pagePath: optionalString("小程序页面路径。"),
                    coverImgUrl: optionalString("小程序封面图。"),
                    title: optionalString("小程序标题。"),
                    userName: optionalString("小程序原始 userName。"),
                  },
                  { additionalProperties: false },
                ),
              ),
              forward: Type.Optional(
                Type.Object(
                  {
                    kind: Type.Optional(
                      Type.Union([
                        Type.Literal("image"),
                        Type.Literal("video"),
                        Type.Literal("file"),
                        Type.Literal("link"),
                        Type.Literal("miniApp"),
                      ]),
                    ),
                    xml: optionalString("GeWe 转发消息 XML。"),
                    coverImgUrl: optionalString("转发 miniApp 时需要的封面图。"),
                  },
                  { additionalProperties: false },
                ),
              ),
            },
            { additionalProperties: false },
          ),
        ),
      },
      visibility: "all-configured",
    },
  ];
}

function readStringParam(
  params: Record<string, unknown>,
  key: string,
  opts?: { allowEmpty?: boolean },
): string | undefined {
  const raw = params[key];
  if (typeof raw !== "string") {
    return undefined;
  }
  const value = opts?.allowEmpty ? raw : raw.trim();
  return opts?.allowEmpty ? value : value || undefined;
}

function readGeweObject(params: Record<string, unknown>): Record<string, unknown> | undefined {
  const value = params.gewe;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readScopedObject(
  parent: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = parent?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function resolveCurrentTarget(raw: string | undefined | null): string | undefined {
  if (!raw) {
    return undefined;
  }
  return normalizeGeweMessagingTarget(raw) ?? undefined;
}

function resolveTargetFromAction(params: {
  args: Record<string, unknown>;
  currentChannelId?: string | null;
  required: boolean;
}): string | undefined {
  const explicit =
    readStringParam(params.args, "to") ??
    readStringParam(params.args, "target") ??
    readStringParam(params.args, "chatId");
  const target = resolveCurrentTarget(explicit ?? params.currentChannelId);
  if (!target && params.required) {
    throw new Error("GeWe action requires a target conversation.");
  }
  return target;
}

function resolveReplyMessageId(params: {
  args: Record<string, unknown>;
  currentMessageId?: string | number | null;
}): string | undefined {
  const explicit =
    readStringParam(params.args, "replyTo") ??
    readStringParam(params.args, "messageId") ??
    (typeof params.currentMessageId === "number"
      ? String(params.currentMessageId)
      : params.currentMessageId?.trim() || undefined);
  return explicit?.trim() || undefined;
}

function resolveTextPayload(params: Record<string, unknown>): string | undefined {
  const message = readStringParam(params, "message", { allowEmpty: true });
  const text = readStringParam(params, "text", { allowEmpty: true });
  const caption = readStringParam(params, "caption", { allowEmpty: true });
  const chosen = message ?? text ?? caption;
  if (typeof chosen !== "string") {
    return undefined;
  }
  return chosen;
}

function resolveMediaPayload(params: Record<string, unknown>): string | undefined {
  return (
    readStringParam(params, "media") ??
    readStringParam(params, "path") ??
    readStringParam(params, "filePath")
  );
}

function buildScopedPayloadData(params: {
  args: Record<string, unknown>;
  replyToId?: string;
  requesterSenderId?: string | null;
  isGroupTarget: boolean;
}): GeweActionScopedPayload | undefined {
  const gewe = readGeweObject(params.args);
  if (!gewe && !params.replyToId) {
    return undefined;
  }

  const quote = readScopedObject(gewe, "quote");
  const emoji = readScopedObject(gewe, "emoji");
  const nameCard = readScopedObject(gewe, "nameCard");
  const miniApp = readScopedObject(gewe, "miniApp");
  const forward = readScopedObject(gewe, "forward");

  const scoped: GeweActionScopedPayload = {};

  if (params.replyToId || quote) {
    const partialText = readStringParam(quote ?? {}, "partialText", { allowEmpty: true });
    let atWxid = readStringParam(quote ?? {}, "atWxid");
    const atSender = (quote?.atSender as boolean | undefined) === true;
    if (atSender) {
      if (!params.isGroupTarget || !params.requesterSenderId?.trim()) {
        throw new Error("GeWe gewe.quote.atSender requires a current group message sender.");
      }
      atWxid = params.requesterSenderId.trim();
    }
    scoped.quoteReply = {
      svrid: params.replyToId,
      ...(atWxid ? { atWxid } : {}),
      ...(partialText != null ? { partialText: { text: partialText } } : {}),
    };
  }

  if (emoji) {
    const emojiMd5 = readStringParam(emoji, "emojiMd5");
    const emojiSizeRaw = emoji.emojiSize;
    if (emojiMd5 && typeof emojiSizeRaw === "number") {
      scoped.emoji = {
        emojiMd5,
        emojiSize: emojiSizeRaw,
      };
    }
  }

  if (nameCard) {
    const nickName = readStringParam(nameCard, "nickName");
    const nameCardWxid = readStringParam(nameCard, "nameCardWxid");
    if (nickName && nameCardWxid) {
      scoped.nameCard = {
        nickName,
        nameCardWxid,
      };
    }
  }

  if (miniApp) {
    const miniAppId = readStringParam(miniApp, "miniAppId");
    const displayName = readStringParam(miniApp, "displayName");
    const pagePath = readStringParam(miniApp, "pagePath");
    const coverImgUrl = readStringParam(miniApp, "coverImgUrl");
    const title = readStringParam(miniApp, "title");
    const userName = readStringParam(miniApp, "userName");
    if (miniAppId && displayName && pagePath && coverImgUrl && title && userName) {
      scoped.miniApp = {
        miniAppId,
        displayName,
        pagePath,
        coverImgUrl,
        title,
        userName,
      };
    }
  }

  if (forward) {
    const kind = forward.kind;
    const xml = readStringParam(forward, "xml", { allowEmpty: true });
    const coverImgUrl = readStringParam(forward, "coverImgUrl");
    if (
      xml &&
      (kind === "image" ||
        kind === "video" ||
        kind === "file" ||
        kind === "link" ||
        kind === "miniApp")
    ) {
      scoped.forward = {
        kind,
        xml,
        ...(coverImgUrl ? { coverImgUrl } : {}),
      };
    }
  }

  return Object.keys(scoped).length > 0 ? scoped : undefined;
}

function buildReplyPayload(params: {
  args: Record<string, unknown>;
  replyToId?: string;
  requesterSenderId?: string | null;
  isGroupTarget: boolean;
}): ReplyPayload {
  const text = resolveTextPayload(params.args);
  const mediaUrl = resolveMediaPayload(params.args);
  const asVoice = params.args.asVoice === true;
  const scoped = buildScopedPayloadData(params);

  const payload: ReplyPayload = {
    ...(typeof text === "string" ? { text } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(params.replyToId ? { replyToId: params.replyToId } : {}),
    ...(asVoice ? { audioAsVoice: true } : {}),
  };

  if (scoped) {
    payload.channelData = {
      "gewe-openclaw": scoped,
    };
  }

  const hasContent =
    Boolean(text?.trim()) ||
    Boolean(mediaUrl) ||
    Boolean(scoped?.quoteReply) ||
    Boolean(scoped?.emoji) ||
    Boolean(scoped?.nameCard) ||
    Boolean(scoped?.miniApp) ||
    Boolean(scoped?.forward);
  if (!hasContent) {
    throw new Error("GeWe action requires message, media, or a gewe payload.");
  }
  return payload;
}

function resolveConfiguredAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}) {
  return resolveGeweAccount({
    cfg: params.cfg as CoreConfig,
    accountId: params.accountId,
  });
}

async function executeSendLikeAction(params: Parameters<
  NonNullable<ChannelMessageActionAdapter["handleAction"]>
>[0] & {
  replyToId?: string;
  target: string;
}): Promise<JsonResult> {
  const account = resolveConfiguredAccount({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  const payload = buildReplyPayload({
    args: params.params,
    replyToId: params.replyToId,
    requesterSenderId: params.requesterSenderId,
    isGroupTarget: params.target.endsWith("@chatroom"),
  });
  const result = await deliverGewePayload({
    payload,
    account,
    cfg: params.cfg,
    toWxid: params.target,
  });
  return jsonResult({
    ok: true,
    action: params.action,
    to: params.target,
    messageId: result?.messageId ?? null,
    newMessageId: result?.newMessageId ?? null,
    timestamp: result?.timestamp ?? null,
  });
}

export const geweMessageActions: ChannelMessageActionAdapter = {
  describeMessageTool: ({ cfg }) => {
    const accounts = listEnabledGeweAccounts(cfg as CoreConfig).filter(
      (account) => account.token.trim() && account.appId.trim(),
    );
    if (accounts.length === 0) {
      return null;
    }
    return {
      actions: ["send", "reply", "unsend"],
      schema: createGeweSchemaContribution(),
    };
  },
  supportsAction: ({ action }) => SUPPORTED_ACTIONS.has(action),
  extractToolSend: ({ args }) => extractToolSend(args, "sendMessage"),
  handleAction: async (ctx) => {
    if (ctx.action === "send") {
      const target = resolveTargetFromAction({
        args: ctx.params,
        currentChannelId: ctx.toolContext?.currentChannelId,
        required: true,
      });
      return await executeSendLikeAction({
        ...ctx,
        target: target!,
        replyToId: readStringParam(ctx.params, "replyTo"),
      });
    }

    if (ctx.action === "reply") {
      const target = resolveTargetFromAction({
        args: ctx.params,
        currentChannelId: ctx.toolContext?.currentChannelId,
        required: true,
      });
      const replyToId = resolveReplyMessageId({
        args: ctx.params,
        currentMessageId: ctx.toolContext?.currentMessageId,
      });
      if (!replyToId) {
        throw new Error("GeWe reply requires replyTo/messageId or a current inbound message.");
      }
      return await executeSendLikeAction({
        ...ctx,
        target: target!,
        replyToId,
      });
    }

    if (ctx.action === "unsend") {
      const target = resolveTargetFromAction({
        args: ctx.params,
        currentChannelId: ctx.toolContext?.currentChannelId,
        required: true,
      });
      const messageId = readStringParam(ctx.params, "messageId");
      const newMessageId =
        readStringParam(ctx.params, "newMessageId") ?? readStringParam(ctx.params, "newMsgId");
      const createTime = readStringParam(ctx.params, "createTime");
      if (!messageId || !newMessageId || !createTime) {
        throw new Error("GeWe unsend requires messageId, newMessageId, and createTime.");
      }
      const account = resolveConfiguredAccount({
        cfg: ctx.cfg,
        accountId: ctx.accountId,
      });
      const result = await deliverGewePayload({
        payload: {
          channelData: {
            "gewe-openclaw": {
              revoke: {
                msgId: messageId,
                newMsgId: newMessageId,
                createTime,
              },
            },
          },
        },
        account,
        cfg: ctx.cfg,
        toWxid: target!,
      });
      return jsonResult({
        ok: true,
        action: ctx.action,
        to: target,
        messageId: result?.messageId ?? null,
        newMessageId: result?.newMessageId ?? null,
        timestamp: result?.timestamp ?? null,
      });
    }

    throw new Error(`Unsupported GeWe action: ${ctx.action}`);
  },
};

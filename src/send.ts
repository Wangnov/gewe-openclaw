import { resolveGeweTransportBaseUrl, resolveIsGatewayMode } from "./accounts.js";
import { assertGeweOk, postGatewayJson, postGeweJson } from "./api.js";
import type { GeweSendResult, ResolvedGeweAccount } from "./types.js";

type GeweSendContext = {
  baseUrl: string;
  mode: "direct" | "gateway";
  token?: string;
  gatewayKey?: string;
  appId?: string;
};

function buildContext(account: ResolvedGeweAccount): GeweSendContext {
  if (resolveIsGatewayMode(account)) {
    return {
      mode: "gateway",
      baseUrl: resolveGeweTransportBaseUrl(account),
      gatewayKey: account.config.gatewayKey?.trim(),
    };
  }
  return {
    mode: "direct",
    baseUrl: resolveGeweTransportBaseUrl(account),
    token: account.token,
    appId: account.appId,
  };
}

async function postSendJson<T>(params: {
  ctx: GeweSendContext;
  path: string;
  body: Record<string, unknown>;
}): Promise<{ ret: number; msg: string; data?: T }> {
  if (params.ctx.mode === "gateway") {
    return postGatewayJson<{ ret: number; msg: string; data?: T }>({
      baseUrl: params.ctx.baseUrl,
      gatewayKey: params.ctx.gatewayKey?.trim() ?? "",
      path: params.path,
      body: params.body,
    });
  }
  return postGeweJson<T>({
    baseUrl: params.ctx.baseUrl,
    token: params.ctx.token?.trim() ?? "",
    path: params.path,
    body: {
      appId: params.ctx.appId,
      ...params.body,
    },
  });
}

function resolveSendResult(params: {
  toWxid: string;
  data?: {
    msgId?: number | string;
    newMsgId?: number | string;
    createTime?: number | null;
  };
}): GeweSendResult {
  const msgId = params.data?.newMsgId ?? params.data?.msgId ?? "ok";
  const createTime = params.data?.createTime;
  return {
    toWxid: params.toWxid,
    messageId: String(msgId),
    newMessageId: params.data?.newMsgId ? String(params.data.newMsgId) : undefined,
    timestamp: typeof createTime === "number" ? createTime * 1000 : undefined,
  };
}

export async function sendTextGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  content: string;
  ats?: string;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postSendJson<{
    msgId?: number | string;
    newMsgId?: number | string;
    createTime?: number;
  }>({
    ctx,
    path: "/gewe/v2/api/message/postText",
    body: {
      toWxid: params.toWxid,
      content: params.content,
      ...(params.ats ? { ats: params.ats } : {}),
    },
  });
  const data = assertGeweOk(resp, "postText");
  return resolveSendResult({ toWxid: params.toWxid, data });
}

export async function sendImageGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  imgUrl: string;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postSendJson({
    ctx,
    path: "/gewe/v2/api/message/postImage",
    body: {
      toWxid: params.toWxid,
      imgUrl: params.imgUrl,
    },
  });
  const data = assertGeweOk(resp, "postImage");
  return resolveSendResult({ toWxid: params.toWxid, data });
}

export async function sendVoiceGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  voiceUrl: string;
  voiceDuration: number;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postSendJson({
    ctx,
    path: "/gewe/v2/api/message/postVoice",
    body: {
      toWxid: params.toWxid,
      voiceUrl: params.voiceUrl,
      voiceDuration: params.voiceDuration,
    },
  });
  const data = assertGeweOk(resp, "postVoice");
  return resolveSendResult({ toWxid: params.toWxid, data });
}

export async function sendVideoGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  videoUrl: string;
  thumbUrl: string;
  videoDuration: number;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postSendJson({
    ctx,
    path: "/gewe/v2/api/message/postVideo",
    body: {
      toWxid: params.toWxid,
      videoUrl: params.videoUrl,
      thumbUrl: params.thumbUrl,
      videoDuration: params.videoDuration,
    },
  });
  const data = assertGeweOk(resp, "postVideo");
  return resolveSendResult({ toWxid: params.toWxid, data });
}

export async function sendFileGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  fileUrl: string;
  fileName: string;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postSendJson({
    ctx,
    path: "/gewe/v2/api/message/postFile",
    body: {
      toWxid: params.toWxid,
      fileUrl: params.fileUrl,
      fileName: params.fileName,
    },
  });
  const data = assertGeweOk(resp, "postFile");
  return resolveSendResult({ toWxid: params.toWxid, data });
}

export async function sendLinkGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  title: string;
  desc: string;
  linkUrl: string;
  thumbUrl: string;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postSendJson({
    ctx,
    path: "/gewe/v2/api/message/postLink",
    body: {
      toWxid: params.toWxid,
      title: params.title,
      desc: params.desc,
      linkUrl: params.linkUrl,
      thumbUrl: params.thumbUrl,
    },
  });
  const data = assertGeweOk(resp, "postLink");
  return resolveSendResult({ toWxid: params.toWxid, data });
}

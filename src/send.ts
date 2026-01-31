import { assertGeweOk, postGeweJson } from "./api.js";
import type { GeweSendResult, ResolvedGeweAccount } from "./types.js";

type GeweSendContext = {
  baseUrl: string;
  token: string;
  appId: string;
};

function buildContext(account: ResolvedGeweAccount): GeweSendContext {
  const baseUrl = account.config.apiBaseUrl?.trim() || "https://www.geweapi.com";
  return { baseUrl, token: account.token, appId: account.appId };
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
  const resp = await postGeweJson<{
    msgId?: number | string;
    newMsgId?: number | string;
    createTime?: number;
  }>({
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    path: "/gewe/v2/api/message/postText",
    body: {
      appId: ctx.appId,
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
  const resp = await postGeweJson({
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    path: "/gewe/v2/api/message/postImage",
    body: {
      appId: ctx.appId,
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
  const resp = await postGeweJson({
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    path: "/gewe/v2/api/message/postVoice",
    body: {
      appId: ctx.appId,
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
  const resp = await postGeweJson({
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    path: "/gewe/v2/api/message/postVideo",
    body: {
      appId: ctx.appId,
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
  const resp = await postGeweJson({
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    path: "/gewe/v2/api/message/postFile",
    body: {
      appId: ctx.appId,
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
  const resp = await postGeweJson({
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    path: "/gewe/v2/api/message/postLink",
    body: {
      appId: ctx.appId,
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

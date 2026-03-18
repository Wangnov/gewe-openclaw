import { assertGeweOk, postGeweJson } from "./api.js";
import type { GeweSendResult, ResolvedGeweAccount } from "./types.js";

type GeweSendContext = {
  baseUrl: string;
  token: string;
  appId: string;
};

type GeweSendResponseData = {
  msgId?: number | string;
  newMsgId?: number | string;
  createTime?: number | null;
};

function buildContext(account: ResolvedGeweAccount): GeweSendContext {
  const baseUrl = account.config.apiBaseUrl?.trim() || "https://www.geweapi.com";
  return { baseUrl, token: account.token, appId: account.appId };
}

function resolveSendResult(params: {
  toWxid: string;
  data?: GeweSendResponseData;
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

async function sendXmlForwardGewe(params: {
  account: ResolvedGeweAccount;
  path: string;
  context: string;
  toWxid: string;
  xml: string;
  extraBody?: Record<string, unknown>;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postGeweJson<GeweSendResponseData>({
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    path: params.path,
    body: {
      appId: ctx.appId,
      toWxid: params.toWxid,
      xml: params.xml,
      ...(params.extraBody ?? {}),
    },
  });
  const data = assertGeweOk(resp, params.context);
  return resolveSendResult({ toWxid: params.toWxid, data });
}

export async function sendTextGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  content: string;
  ats?: string;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postGeweJson<GeweSendResponseData>({
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
  const resp = await postGeweJson<GeweSendResponseData>({
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
  const resp = await postGeweJson<GeweSendResponseData>({
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
  const resp = await postGeweJson<GeweSendResponseData>({
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
  const resp = await postGeweJson<GeweSendResponseData>({
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
  const resp = await postGeweJson<GeweSendResponseData>({
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

export async function sendAppMsgGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  appmsg: string;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postGeweJson<GeweSendResponseData>({
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    path: "/gewe/v2/api/message/postAppMsg",
    body: {
      appId: ctx.appId,
      toWxid: params.toWxid,
      appmsg: params.appmsg,
    },
  });
  const data = assertGeweOk(resp, "postAppMsg");
  return resolveSendResult({ toWxid: params.toWxid, data });
}

export async function sendEmojiGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  emojiMd5: string;
  emojiSize: number;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postGeweJson<GeweSendResponseData>({
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    path: "/gewe/v2/api/message/postEmoji",
    body: {
      appId: ctx.appId,
      toWxid: params.toWxid,
      emojiMd5: params.emojiMd5,
      emojiSize: params.emojiSize,
    },
  });
  const data = assertGeweOk(resp, "postEmoji");
  return resolveSendResult({ toWxid: params.toWxid, data });
}

export async function sendNameCardGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  nickName: string;
  nameCardWxid: string;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postGeweJson<GeweSendResponseData>({
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    path: "/gewe/v2/api/message/postNameCard",
    body: {
      appId: ctx.appId,
      toWxid: params.toWxid,
      nickName: params.nickName,
      nameCardWxid: params.nameCardWxid,
    },
  });
  const data = assertGeweOk(resp, "postNameCard");
  return resolveSendResult({ toWxid: params.toWxid, data });
}

export async function sendMiniAppGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  miniAppId: string;
  displayName: string;
  pagePath: string;
  coverImgUrl: string;
  title: string;
  userName: string;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postGeweJson<GeweSendResponseData>({
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    path: "/gewe/v2/api/message/postMiniApp",
    body: {
      appId: ctx.appId,
      toWxid: params.toWxid,
      miniAppId: params.miniAppId,
      displayName: params.displayName,
      pagePath: params.pagePath,
      coverImgUrl: params.coverImgUrl,
      title: params.title,
      userName: params.userName,
    },
  });
  const data = assertGeweOk(resp, "postMiniApp");
  return resolveSendResult({ toWxid: params.toWxid, data });
}

export async function revokeMessageGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  msgId: string;
  newMsgId: string;
  createTime: string;
}): Promise<GeweSendResult> {
  const ctx = buildContext(params.account);
  const resp = await postGeweJson<GeweSendResponseData>({
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    path: "/gewe/v2/api/message/revokeMsg",
    body: {
      appId: ctx.appId,
      toWxid: params.toWxid,
      msgId: params.msgId,
      newMsgId: params.newMsgId,
      createTime: params.createTime,
    },
  });
  assertGeweOk(resp, "revokeMsg");
  return {
    toWxid: params.toWxid,
    messageId: params.msgId,
    newMessageId: params.newMsgId,
    timestamp: Number.parseInt(params.createTime, 10) * 1000 || undefined,
  };
}

export async function forwardImageGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  xml: string;
}): Promise<GeweSendResult> {
  return await sendXmlForwardGewe({
    account: params.account,
    path: "/gewe/v2/api/message/forwardImage",
    context: "forwardImage",
    toWxid: params.toWxid,
    xml: params.xml,
  });
}

export async function forwardVideoGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  xml: string;
}): Promise<GeweSendResult> {
  return await sendXmlForwardGewe({
    account: params.account,
    path: "/gewe/v2/api/message/forwardVideo",
    context: "forwardVideo",
    toWxid: params.toWxid,
    xml: params.xml,
  });
}

export async function forwardFileGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  xml: string;
}): Promise<GeweSendResult> {
  return await sendXmlForwardGewe({
    account: params.account,
    path: "/gewe/v2/api/message/forwardFile",
    context: "forwardFile",
    toWxid: params.toWxid,
    xml: params.xml,
  });
}

export async function forwardLinkGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  xml: string;
}): Promise<GeweSendResult> {
  return await sendXmlForwardGewe({
    account: params.account,
    path: "/gewe/v2/api/message/forwardUrl",
    context: "forwardUrl",
    toWxid: params.toWxid,
    xml: params.xml,
  });
}

export async function forwardMiniAppGewe(params: {
  account: ResolvedGeweAccount;
  toWxid: string;
  xml: string;
  coverImgUrl: string;
}): Promise<GeweSendResult> {
  return await sendXmlForwardGewe({
    account: params.account,
    path: "/gewe/v2/api/message/forwardMiniApp",
    context: "forwardMiniApp",
    toWxid: params.toWxid,
    xml: params.xml,
    extraBody: {
      coverImgUrl: params.coverImgUrl,
    },
  });
}

import { assertGeweOk, postGeweJson } from "./api.js";
import type { ResolvedGeweAccount } from "./types.js";

type DownloadResult = { fileUrl: string };

function resolveBaseUrl(account: ResolvedGeweAccount): string {
  return account.config.apiBaseUrl?.trim() || "http://api.geweapi.com";
}

export async function downloadGeweImage(params: {
  account: ResolvedGeweAccount;
  xml: string;
  type: 1 | 2 | 3;
}): Promise<string> {
  const resp = await postGeweJson<DownloadResult>({
    baseUrl: resolveBaseUrl(params.account),
    token: params.account.token,
    path: "/gewe/v2/api/message/downloadImage",
    body: {
      appId: params.account.appId,
      xml: params.xml,
      type: params.type,
    },
  });
  const data = assertGeweOk(resp, "downloadImage");
  if (!data?.fileUrl) throw new Error("GeWe downloadImage missing fileUrl");
  return data.fileUrl;
}

export async function downloadGeweVoice(params: {
  account: ResolvedGeweAccount;
  xml: string;
  msgId: number;
}): Promise<string> {
  const resp = await postGeweJson<DownloadResult>({
    baseUrl: resolveBaseUrl(params.account),
    token: params.account.token,
    path: "/gewe/v2/api/message/downloadVoice",
    body: {
      appId: params.account.appId,
      xml: params.xml,
      msgId: params.msgId,
    },
  });
  const data = assertGeweOk(resp, "downloadVoice");
  if (!data?.fileUrl) throw new Error("GeWe downloadVoice missing fileUrl");
  return data.fileUrl;
}

export async function downloadGeweVideo(params: {
  account: ResolvedGeweAccount;
  xml: string;
}): Promise<string> {
  const resp = await postGeweJson<DownloadResult>({
    baseUrl: resolveBaseUrl(params.account),
    token: params.account.token,
    path: "/gewe/v2/api/message/downloadVideo",
    body: {
      appId: params.account.appId,
      xml: params.xml,
    },
  });
  const data = assertGeweOk(resp, "downloadVideo");
  if (!data?.fileUrl) throw new Error("GeWe downloadVideo missing fileUrl");
  return data.fileUrl;
}

export async function downloadGeweFile(params: {
  account: ResolvedGeweAccount;
  xml: string;
}): Promise<string> {
  const resp = await postGeweJson<DownloadResult>({
    baseUrl: resolveBaseUrl(params.account),
    token: params.account.token,
    path: "/gewe/v2/api/message/downloadFile",
    body: {
      appId: params.account.appId,
      xml: params.xml,
    },
  });
  const data = assertGeweOk(resp, "downloadFile");
  if (!data?.fileUrl) throw new Error("GeWe downloadFile missing fileUrl");
  return data.fileUrl;
}

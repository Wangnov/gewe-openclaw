import { resolveGeweTransportBaseUrl, resolveIsGatewayMode } from "./accounts.js";
import { assertGeweOk, postGatewayJson, postGeweJson } from "./api.js";
import type { ResolvedGeweAccount } from "./types.js";

type DownloadResult = { fileUrl: string };

type DownloadContext = {
  mode: "direct" | "gateway";
  baseUrl: string;
  token?: string;
  gatewayKey?: string;
  appId?: string;
};

function buildContext(account: ResolvedGeweAccount): DownloadContext {
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

async function postDownloadJson(params: {
  ctx: DownloadContext;
  path: string;
  body: Record<string, unknown>;
}): Promise<{ ret: number; msg: string; data?: DownloadResult }> {
  if (params.ctx.mode === "gateway") {
    return postGatewayJson<{ ret: number; msg: string; data?: DownloadResult }>({
      baseUrl: params.ctx.baseUrl,
      gatewayKey: params.ctx.gatewayKey?.trim() ?? "",
      path: params.path,
      body: params.body,
    });
  }
  return postGeweJson<DownloadResult>({
    baseUrl: params.ctx.baseUrl,
    token: params.ctx.token?.trim() ?? "",
    path: params.path,
    body: {
      appId: params.ctx.appId,
      ...params.body,
    },
  });
}

export async function downloadGeweImage(params: {
  account: ResolvedGeweAccount;
  xml: string;
  type: 1 | 2 | 3;
}): Promise<string> {
  const resp = await postDownloadJson({
    ctx: buildContext(params.account),
    path: "/gewe/v2/api/message/downloadImage",
    body: {
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
  const resp = await postDownloadJson({
    ctx: buildContext(params.account),
    path: "/gewe/v2/api/message/downloadVoice",
    body: {
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
  const resp = await postDownloadJson({
    ctx: buildContext(params.account),
    path: "/gewe/v2/api/message/downloadVideo",
    body: {
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
  const resp = await postDownloadJson({
    ctx: buildContext(params.account),
    path: "/gewe/v2/api/message/downloadFile",
    body: {
      xml: params.xml,
    },
  });
  const data = assertGeweOk(resp, "downloadFile");
  if (!data?.fileUrl) throw new Error("GeWe downloadFile missing fileUrl");
  return data.fileUrl;
}

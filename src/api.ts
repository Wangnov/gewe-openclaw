export type GeweApiResponse<T> = {
  ret: number;
  msg: string;
  data?: T;
};

export function buildGeweUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

async function readResponseText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function postJson<T>(params: {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}): Promise<T> {
  const res = await fetch(params.url, {
    method: "POST",
    headers: params.headers,
    body: JSON.stringify(params.body),
  });

  if (!res.ok) {
    const text = await readResponseText(res);
    const detail = text ? `: ${text}` : "";
    throw new Error(`HTTP request failed (${res.status})${detail}`);
  }

  return (await res.json()) as T;
}

export async function postGeweJson<T>(params: {
  baseUrl: string;
  token: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<GeweApiResponse<T>> {
  const url = buildGeweUrl(params.baseUrl, params.path);
  return postJson<GeweApiResponse<T>>({
    url,
    headers: {
      "Content-Type": "application/json",
      "X-GEWE-TOKEN": params.token,
    },
    body: params.body,
  });
}

export async function postGatewayJson<T>(params: {
  baseUrl: string;
  gatewayKey: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<T> {
  const url = buildGeweUrl(params.baseUrl, params.path);
  return postJson<T>({
    url,
    headers: {
      "Content-Type": "application/json",
      "X-GeWe-Gateway-Key": params.gatewayKey,
    },
    body: params.body,
  });
}

export function assertGeweOk<T>(resp: GeweApiResponse<T>, context: string): T | undefined {
  if (resp.ret !== 200) {
    const msg = resp.msg?.trim() || "unknown error";
    throw new Error(`GeWe API ${context} failed: ${resp.ret} ${msg}`);
  }
  return resp.data;
}

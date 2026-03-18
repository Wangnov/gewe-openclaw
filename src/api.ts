export type GeweApiResponse<T> = {
  ret: number;
  msg: string;
  data?: T;
};

const GEWE_LARGE_ID_FIELD_PATTERN =
  /("(?:msgId|newMsgId|MsgId|NewMsgId)"\s*:\s*)(-?\d{16,})(?=[,\}])/g;

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

export function parseGeweJsonText<T>(text: string): T {
  const normalized = text.replace(GEWE_LARGE_ID_FIELD_PATTERN, '$1"$2"');
  return JSON.parse(normalized) as T;
}

export async function postGeweJson<T>(params: {
  baseUrl: string;
  token: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<GeweApiResponse<T>> {
  const url = buildGeweUrl(params.baseUrl, params.path);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GEWE-TOKEN": params.token,
    },
    body: JSON.stringify(params.body),
  });

  if (!res.ok) {
    const text = await readResponseText(res);
    const detail = text ? `: ${text}` : "";
    throw new Error(`GeWe API request failed (${res.status})${detail}`);
  }

  const text = await readResponseText(res);
  try {
    return parseGeweJsonText<GeweApiResponse<T>>(text);
  } catch (error) {
    const detail = text ? `: ${text}` : "";
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`GeWe API returned invalid JSON (${reason})${detail}`);
  }
}

export function assertGeweOk<T>(resp: GeweApiResponse<T>, context: string): T | undefined {
  if (resp.ret !== 200) {
    const msg = resp.msg?.trim() || "unknown error";
    throw new Error(`GeWe API ${context} failed: ${resp.ret} ${msg}`);
  }
  return resp.data;
}

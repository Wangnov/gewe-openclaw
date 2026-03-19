import assert from "node:assert/strict";
import test from "node:test";

import type { ResolvedGeweAccount } from "./types.js";
import {
  getProfileGewe,
  getQrCodeGewe,
  getSafetyInfoGewe,
  privacySettingsGewe,
  updateHeadImgGewe,
  updateProfileGewe,
} from "./personal-api.js";

const account: ResolvedGeweAccount = {
  accountId: "default",
  enabled: true,
  token: "token",
  tokenSource: "config",
  appId: "app-id",
  appIdSource: "config",
  config: {
    apiBaseUrl: "https://api.example.com",
  },
};

type FetchCall = {
  url: string;
  init?: RequestInit;
};

async function withMockFetch<T>(
  fn: (calls: FetchCall[]) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return new Response(
      JSON.stringify({
        ret: 200,
        msg: "ok",
        data: { ok: true, url },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function readJsonBody(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call.init?.body ?? "{}")) as Record<string, unknown>;
}

const cases = [
  {
    name: "updateProfile",
    run: () =>
      updateProfileGewe({
        account,
        country: "CN",
        province: "Shanghai",
        city: "Shanghai",
        nickName: "Bot",
        sex: 1,
        signature: "hello",
      }),
    path: "/gewe/v2/api/personal/updateProfile",
    body: {
      country: "CN",
      province: "Shanghai",
      city: "Shanghai",
      nickName: "Bot",
      sex: 1,
      signature: "hello",
    },
  },
  {
    name: "updateHeadImg",
    run: () => updateHeadImgGewe({ account, headImgUrl: "https://example.com/avatar.jpg" }),
    path: "/gewe/v2/api/personal/updateHeadImg",
    body: { headImgUrl: "https://example.com/avatar.jpg" },
  },
  {
    name: "getProfile",
    run: () => getProfileGewe({ account }),
    path: "/gewe/v2/api/personal/getProfile",
    body: {},
  },
  {
    name: "getQrCode",
    run: () => getQrCodeGewe({ account }),
    path: "/gewe/v2/api/personal/getQrCode",
    body: {},
  },
  {
    name: "getSafetyInfo",
    run: () => getSafetyInfoGewe({ account }),
    path: "/gewe/v2/api/personal/getSafetyInfo",
    body: {},
  },
  {
    name: "privacySettings",
    run: () => privacySettingsGewe({ account, option: 4, open: true }),
    path: "/gewe/v2/api/personal/privacySettings",
    body: { option: 4, open: true },
  },
] as const;

for (const entry of cases) {
  test(`GeWe 个人资料 API ${entry.name} 会调用官方端点并自动注入 appId`, async () => {
    await withMockFetch(async (calls) => {
      const result = await entry.run();
      assert.deepEqual(result, {
        ok: true,
        url: `https://api.example.com${entry.path}`,
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.url, `https://api.example.com${entry.path}`);
      assert.equal(calls[0]?.init?.method, "POST");
      const headers = calls[0]?.init?.headers as Record<string, string>;
      assert.equal(headers["X-GEWE-TOKEN"], "token");
      const body = readJsonBody(calls[0]!);
      assert.deepEqual(body, {
        appId: "app-id",
        ...entry.body,
      });
    });
  });
}

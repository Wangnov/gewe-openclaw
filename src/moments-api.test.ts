import assert from "node:assert/strict";
import test from "node:test";

import type { ResolvedGeweAccount } from "./types.js";
import {
  commentSnsGewe,
  contactsSnsListGewe,
  delSnsGewe,
  downloadSnsVideoGewe,
  forwardSnsGewe,
  likeSnsGewe,
  sendImgSnsGewe,
  sendTextSnsGewe,
  sendUrlSnsGewe,
  sendVideoSnsGewe,
  snsDetailsGewe,
  snsListGewe,
  snsSetPrivacyGewe,
  snsVisibleScopeGewe,
  strangerVisibilityEnabledGewe,
  uploadSnsImageGewe,
  uploadSnsVideoGewe,
} from "./moments-api.js";

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
    name: "uploadSnsImage",
    run: () => uploadSnsImageGewe({ account, imgUrls: ["https://example.com/1.jpg"] }),
    path: "/gewe/v2/api/sns/uploadSnsImage",
    body: { imgUrls: ["https://example.com/1.jpg"] },
  },
  {
    name: "uploadSnsVideo",
    run: () =>
      uploadSnsVideoGewe({
        account,
        thumbUrl: "https://example.com/1.jpg",
        videoUrl: "https://example.com/1.mp4",
      }),
    path: "/gewe/v2/api/sns/uploadSnsVideo",
    body: {
      thumbUrl: "https://example.com/1.jpg",
      videoUrl: "https://example.com/1.mp4",
    },
  },
  {
    name: "downloadSnsVideo",
    run: () => downloadSnsVideoGewe({ account, snsXml: "<timeline/>" }),
    path: "/gewe/v2/api/sns/downloadSnsVideo",
    body: { snsXml: "<timeline/>" },
  },
  {
    name: "delSns",
    run: () => delSnsGewe({ account, snsId: "sns-1" }),
    path: "/gewe/v2/api/sns/delSns",
    body: { snsId: "sns-1" },
  },
  {
    name: "sendImgSns",
    run: () =>
      sendImgSnsGewe({
        account,
        imgInfos: [{ url: "https://example.com/1.jpg" }],
        content: "图片朋友圈",
        privacy: 0,
        allowWxIds: ["wxid_a"],
        atWxIds: ["wxid_a"],
        disableWxIds: ["wxid_b"],
        allowTagIds: ["1"],
        disableTagIds: ["2"],
      }),
    path: "/gewe/v2/api/sns/sendImgSns",
    body: {
      imgInfos: [{ url: "https://example.com/1.jpg" }],
      content: "图片朋友圈",
      privacy: 0,
      allowWxIds: ["wxid_a"],
      atWxIds: ["wxid_a"],
      disableWxIds: ["wxid_b"],
      allowTagIds: ["1"],
      disableTagIds: ["2"],
    },
  },
  {
    name: "sendTextSns",
    run: () =>
      sendTextSnsGewe({
        account,
        content: "文字朋友圈",
        privacy: 0,
        allowWxIds: ["wxid_a"],
        atWxIds: ["wxid_a"],
        disableWxIds: ["wxid_b"],
        allowTagIds: ["1"],
        disableTagIds: ["2"],
      }),
    path: "/gewe/v2/api/sns/sendTextSns",
    body: {
      content: "文字朋友圈",
      privacy: 0,
      allowWxIds: ["wxid_a"],
      atWxIds: ["wxid_a"],
      disableWxIds: ["wxid_b"],
      allowTagIds: ["1"],
      disableTagIds: ["2"],
    },
  },
  {
    name: "sendVideoSns",
    run: () =>
      sendVideoSnsGewe({
        account,
        videoInfo: { url: "https://example.com/1.mp4" },
        content: "视频朋友圈",
        privacy: 0,
        allowWxIds: ["wxid_a"],
        atWxIds: ["wxid_a"],
        disableWxIds: ["wxid_b"],
        allowTagIds: ["1"],
        disableTagIds: ["2"],
      }),
    path: "/gewe/v2/api/sns/sendVideoSns",
    body: {
      videoInfo: { url: "https://example.com/1.mp4" },
      content: "视频朋友圈",
      privacy: 0,
      allowWxIds: ["wxid_a"],
      atWxIds: ["wxid_a"],
      disableWxIds: ["wxid_b"],
      allowTagIds: ["1"],
      disableTagIds: ["2"],
    },
  },
  {
    name: "sendUrlSns",
    run: () =>
      sendUrlSnsGewe({
        account,
        thumbUrl: "https://example.com/1.jpg",
        linkUrl: "https://example.com/page",
        title: "链接朋友圈",
        description: "详情",
        content: "补充文案",
        privacy: 0,
        allowWxIds: ["wxid_a"],
        atWxIds: ["wxid_a"],
        disableWxIds: ["wxid_b"],
        allowTagIds: ["1"],
        disableTagIds: ["2"],
      }),
    path: "/gewe/v2/api/sns/sendUrlSns",
    body: {
      thumbUrl: "https://example.com/1.jpg",
      linkUrl: "https://example.com/page",
      title: "链接朋友圈",
      description: "详情",
      content: "补充文案",
      privacy: 0,
      allowWxIds: ["wxid_a"],
      atWxIds: ["wxid_a"],
      disableWxIds: ["wxid_b"],
      allowTagIds: ["1"],
      disableTagIds: ["2"],
    },
  },
  {
    name: "strangerVisibilityEnabled",
    run: () => strangerVisibilityEnabledGewe({ account, enabled: true }),
    path: "/gewe/v2/api/sns/strangerVisibilityEnabled",
    body: { enabled: true },
  },
  {
    name: "snsDetails",
    run: () => snsDetailsGewe({ account, snsId: "sns-1" }),
    path: "/gewe/v2/api/sns/snsDetails",
    body: { snsId: "sns-1" },
  },
  {
    name: "likeSns",
    run: () => likeSnsGewe({ account, snsId: "sns-1", operType: 1, wxid: "wxid_a" }),
    path: "/gewe/v2/api/sns/likeSns",
    body: { snsId: "sns-1", operType: 1, wxid: "wxid_a" },
  },
  {
    name: "contactsSnsList",
    run: () =>
      contactsSnsListGewe({
        account,
        wxid: "wxid_a",
        maxId: "0",
        decrypt: true,
        firstPageMd5: "md5",
      }),
    path: "/gewe/v2/api/sns/contactsSnsList",
    body: { wxid: "wxid_a", maxId: "0", decrypt: true, firstPageMd5: "md5" },
  },
  {
    name: "snsList",
    run: () => snsListGewe({ account, maxId: "0", decrypt: true, firstPageMd5: "md5" }),
    path: "/gewe/v2/api/sns/snsList",
    body: { maxId: "0", decrypt: true, firstPageMd5: "md5" },
  },
  {
    name: "snsVisibleScope",
    run: () => snsVisibleScopeGewe({ account, option: 2 }),
    path: "/gewe/v2/api/sns/snsVisibleScope",
    body: { option: 2 },
  },
  {
    name: "snsSetPrivacy",
    run: () => snsSetPrivacyGewe({ account, snsId: "sns-1", open: true }),
    path: "/gewe/v2/api/sns/snsSetPrivacy",
    body: { snsId: "sns-1", open: true },
  },
  {
    name: "commentSns",
    run: () =>
      commentSnsGewe({
        account,
        snsId: "sns-1",
        operType: 1,
        wxid: "wxid_a",
        commentId: "comment-1",
        content: "评论",
      }),
    path: "/gewe/v2/api/sns/commentSns",
    body: {
      snsId: "sns-1",
      operType: 1,
      wxid: "wxid_a",
      commentId: "comment-1",
      content: "评论",
    },
  },
  {
    name: "forwardSns",
    run: () =>
      forwardSnsGewe({
        account,
        snsXml: "<timeline/>",
        allowWxIds: ["wxid_a"],
        atWxIds: ["wxid_a"],
        disableWxIds: ["wxid_b"],
        privacy: 0,
      }),
    path: "/gewe/v2/api/sns/forwardSns",
    body: {
      snsXml: "<timeline/>",
      allowWxIds: ["wxid_a"],
      atWxIds: ["wxid_a"],
      disableWxIds: ["wxid_b"],
      privacy: 0,
    },
  },
] as const;

for (const entry of cases) {
  test(`GeWe 朋友圈 API ${entry.name} 会调用官方端点并自动注入 appId`, async () => {
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

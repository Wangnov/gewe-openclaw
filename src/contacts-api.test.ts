import assert from "node:assert/strict";
import test from "node:test";

import type { ResolvedGeweAccount } from "./types.js";
import {
  addContactsGewe,
  addImContactGewe,
  checkRelationGewe,
  deleteFriendGewe,
  fetchContactsListCacheGewe,
  fetchContactsListGewe,
  getBriefInfoGewe,
  getDetailInfoGewe,
  getImContactDetailGewe,
  getPhoneAddressListGewe,
  searchContactGewe,
  searchImContactGewe,
  setFriendPermissionsGewe,
  setFriendRemarkGewe,
  syncImContactsGewe,
  uploadPhoneAddressListGewe,
} from "./contacts-api.js";

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
    name: "uploadPhoneAddressList",
    run: () => uploadPhoneAddressListGewe({ account, phones: ["13800138000"], opType: 1 }),
    path: "/gewe/v2/api/contacts/uploadPhoneAddressList",
    body: { phones: ["13800138000"], opType: 1 },
  },
  {
    name: "deleteFriend",
    run: () => deleteFriendGewe({ account, wxid: "wxid_friend" }),
    path: "/gewe/v2/api/contacts/deleteFriend",
    body: { wxid: "wxid_friend" },
  },
  {
    name: "syncImContacts",
    run: () => syncImContactsGewe({ account }),
    path: "/gewe/v2/api/im/sync",
    body: {},
  },
  {
    name: "searchImContact",
    run: () => searchImContactGewe({ account, scene: 1, content: "https://work.weixin.qq.com/abc" }),
    path: "/gewe/v2/api/im/search",
    body: { scene: 1, content: "https://work.weixin.qq.com/abc" },
  },
  {
    name: "searchContact",
    run: () => searchContactGewe({ account, contactsInfo: "zhangsan" }),
    path: "/gewe/v2/api/contacts/search",
    body: { contactsInfo: "zhangsan" },
  },
  {
    name: "checkRelation",
    run: () => checkRelationGewe({ account, wxids: ["wxid_a", "wxid_b"] }),
    path: "/gewe/v2/api/contacts/checkRelation",
    body: { wxids: ["wxid_a", "wxid_b"] },
  },
  {
    name: "addImContact",
    run: () => addImContactGewe({ account, v3: "v3_value", v4: "v4_value" }),
    path: "/gewe/v2/api/im/add",
    body: { v3: "v3_value", v4: "v4_value" },
  },
  {
    name: "addContacts",
    run: () =>
      addContactsGewe({
        account,
        scene: 3,
        option: 2,
        v3: "v3_value",
        v4: "v4_value",
        content: "你好",
      }),
    path: "/gewe/v2/api/contacts/addContacts",
    body: {
      scene: 3,
      option: 2,
      v3: "v3_value",
      v4: "v4_value",
      content: "你好",
    },
  },
  {
    name: "getImContactDetail",
    run: () => getImContactDetailGewe({ account, toUserName: "corp_user" }),
    path: "/gewe/v2/api/im/detail",
    body: { toUserName: "corp_user" },
  },
  {
    name: "getPhoneAddressList",
    run: () => getPhoneAddressListGewe({ account, phones: ["13800138000"] }),
    path: "/gewe/v2/api/contacts/getPhoneAddressList",
    body: { phones: ["13800138000"] },
  },
  {
    name: "getBriefInfo",
    run: () => getBriefInfoGewe({ account, wxids: ["wxid_a"] }),
    path: "/gewe/v2/api/contacts/getBriefInfo",
    body: { wxids: ["wxid_a"] },
  },
  {
    name: "getDetailInfo",
    run: () => getDetailInfoGewe({ account, wxids: ["wxid_a"] }),
    path: "/gewe/v2/api/contacts/getDetailInfo",
    body: { wxids: ["wxid_a"] },
  },
  {
    name: "fetchContactsList",
    run: () => fetchContactsListGewe({ account }),
    path: "/gewe/v2/api/contacts/fetchContactsList",
    body: {},
  },
  {
    name: "fetchContactsListCache",
    run: () => fetchContactsListCacheGewe({ account }),
    path: "/gewe/v2/api/contacts/fetchContactsListCache",
    body: {},
  },
  {
    name: "setFriendPermissions",
    run: () => setFriendPermissionsGewe({ account, wxid: "wxid_friend", onlyChat: true }),
    path: "/gewe/v2/api/contacts/setFriendPermissions",
    body: { wxid: "wxid_friend", onlyChat: true },
  },
  {
    name: "setFriendRemark",
    run: () => setFriendRemarkGewe({ account, wxid: "wxid_friend", remark: "新备注" }),
    path: "/gewe/v2/api/contacts/setFriendRemark",
    body: { wxid: "wxid_friend", remark: "新备注" },
  },
] as const;

for (const entry of cases) {
  test(`GeWe 联系人 API ${entry.name} 会调用官方端点并自动注入 appId`, async () => {
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

import assert from "node:assert/strict";
import test from "node:test";

import { resolveGeweAccount } from "./accounts.js";
import { gewePlugin } from "./channel.ts";
import {
  rememberGeweDirectoryObservation,
  resetGeweDirectoryCacheForTests,
} from "./directory-cache.ts";

async function withMockFetch<T>(
  responder: (url: string, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    await responder(String(input), init)) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test.afterEach(() => {
  resetGeweDirectoryCacheForTests();
});

test("GeWe directory 会混合配置、bindings 和缓存条目", async () => {
  rememberGeweDirectoryObservation({
    accountId: "default",
    senderId: "wxid_seen",
    senderName: "Alice",
    groupId: "room@chatroom",
    groupName: "项目群",
  });

  const cfg = {
    bindings: [
      {
        agentId: "ops",
        match: {
          channel: "gewe-openclaw",
          peer: {
            kind: "group",
            id: "bound@chatroom",
          },
        },
      },
    ],
    channels: {
      "gewe-openclaw": {
        token: "token",
        appId: "app-id",
        allowFrom: ["wxid_cfg"],
        groupAllowFrom: ["wxid_group_sender"],
        dms: {
          wxid_dm: {},
        },
        groups: {
          "*": {},
          "room@chatroom": {},
        },
      },
    },
  };

  const peers = await gewePlugin.directory?.listPeers?.({
    cfg: cfg as never,
    runtime: {} as never,
  });
  const groups = await gewePlugin.directory?.listGroups?.({
    cfg: cfg as never,
    runtime: {} as never,
  });

  assert.deepEqual(
    peers?.map((entry) => ({ id: entry.id, name: entry.name })),
    [
      { id: "wxid_cfg", name: undefined },
      { id: "wxid_dm", name: undefined },
      { id: "wxid_group_sender", name: undefined },
      { id: "wxid_seen", name: "Alice" },
    ],
  );
  assert.deepEqual(
    groups?.map((entry) => ({ id: entry.id, name: entry.name })),
    [
      { id: "bound@chatroom", name: undefined },
      { id: "room@chatroom", name: "项目群" },
    ],
  );
});

test("GeWe directory listGroupMembers 会 live 读取群成员并回填到名字解析", async () => {
  const cfg = {
    channels: {
      "gewe-openclaw": {
        token: "token",
        appId: "app-id",
      },
    },
  };

  await withMockFetch(
    async (url) => {
      if (url.endsWith("/gewe/v2/api/group/getChatroomInfo")) {
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: {
              chatroomId: "room@chatroom",
              nickName: "项目群",
              memberList: [
                { wxid: "wxid_alice", nickName: "Alice", displayName: "产品 Alice" },
                { wxid: "wxid_bob", nickName: "Bob", displayName: "" },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    },
    async () => {
      const members = await gewePlugin.directory?.listGroupMembers?.({
        cfg: cfg as never,
        runtime: {} as never,
        groupId: "room@chatroom",
      });
      assert.deepEqual(
        members?.map((entry) => ({ id: entry.id, name: entry.name })),
        [
          { id: "wxid_alice", name: "产品 Alice" },
          { id: "wxid_bob", name: "Bob" },
        ],
      );

      const resolved = await gewePlugin.allowlist?.resolveNames?.({
        cfg: cfg as never,
        scope: "dm",
        entries: ["wxid_alice", "wxid_bob"],
      });
      assert.deepEqual(resolved, [
        { input: "wxid_alice", resolved: true, name: "产品 Alice" },
        { input: "wxid_bob", resolved: true, name: "Bob" },
      ]);
    },
  );
});

test("GeWe directory listPeers 会 live 拉通讯录并用 brief 信息 enrich 名字", async () => {
  const cfg = {
    channels: {
      "gewe-openclaw": {
        token: "token",
        appId: "app-id",
      },
    },
  };

  await withMockFetch(
    async (url) => {
      if (url.endsWith("/gewe/v2/api/contacts/fetchContactsListCache")) {
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: {
              friends: [],
              chatrooms: [],
              ghs: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/gewe/v2/api/contacts/fetchContactsList")) {
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: {
              friends: ["wxid_alice", "wxid_bob"],
              chatrooms: [],
              ghs: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/gewe/v2/api/contacts/getBriefInfo")) {
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: [
              { userName: "wxid_alice", nickName: "Alice", remark: "产品 Alice" },
              { userName: "wxid_bob", nickName: "Bob", remark: "" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    },
    async () => {
      const peers = await gewePlugin.directory?.listPeers?.({
        cfg: cfg as never,
        runtime: {} as never,
      });

      assert.deepEqual(
        peers?.map((entry) => ({ id: entry.id, name: entry.name })),
        [
          { id: "wxid_alice", name: "产品 Alice" },
          { id: "wxid_bob", name: "Bob" },
        ],
      );

      const resolved = await gewePlugin.allowlist?.resolveNames?.({
        cfg: cfg as never,
        scope: "dm",
        entries: ["wxid_alice", "wxid_bob"],
      });
      assert.deepEqual(resolved, [
        { input: "wxid_alice", resolved: true, name: "产品 Alice" },
        { input: "wxid_bob", resolved: true, name: "Bob" },
      ]);
    },
  );
});

test("GeWe allowlist 会读取顶层列表和群覆盖，并优先显示已知群名", async () => {
  rememberGeweDirectoryObservation({
    accountId: "default",
    groupId: "room@chatroom",
    groupName: "项目群",
  });

  const cfg = {
    channels: {
      "gewe-openclaw": {
        token: "token",
        appId: "app-id",
        dmPolicy: "allowlist",
        allowFrom: ["wxid_dm"],
        groupPolicy: "allowlist",
        groupAllowFrom: ["wxid_group"],
        groups: {
          "*": {
            allowFrom: ["wxid_star"],
          },
          "room@chatroom": {
            allowFrom: ["wxid_room"],
          },
        },
      },
    },
  };

  const readConfig = await gewePlugin.allowlist?.readConfig?.({
    cfg: cfg as never,
  });

  assert.deepEqual(readConfig, {
    dmAllowFrom: ["wxid_dm"],
    groupAllowFrom: ["wxid_group"],
    dmPolicy: "allowlist",
    groupPolicy: "allowlist",
    groupOverrides: [
      { label: "*", entries: ["wxid_star"] },
      { label: "项目群", entries: ["wxid_room"] },
    ],
  });
});

test("GeWe allowlist applyConfigEdit 会改写顶层 dm/group allowFrom", async () => {
  const cfg = {
    channels: {
      "gewe-openclaw": {
        allowFrom: ["wxid_old"],
        groupAllowFrom: ["wxid_group_old"],
      },
    },
  };

  const dmParsed = structuredClone(cfg) as Record<string, unknown>;
  const dmResult = await gewePlugin.allowlist?.applyConfigEdit?.({
    cfg: cfg as never,
    parsedConfig: dmParsed,
    scope: "dm",
    action: "add",
    entry: "wxid_new",
  });
  assert.equal(dmResult?.kind, "ok");
  assert.equal(dmResult?.changed, true);
  assert.deepEqual((dmParsed.channels as Record<string, unknown>)["gewe-openclaw"], {
    allowFrom: ["wxid_old", "wxid_new"],
    groupAllowFrom: ["wxid_group_old"],
  });

  const groupParsed = structuredClone(cfg) as Record<string, unknown>;
  const groupResult = await gewePlugin.allowlist?.applyConfigEdit?.({
    cfg: cfg as never,
    parsedConfig: groupParsed,
    scope: "group",
    action: "remove",
    entry: "wxid_group_old",
  });
  assert.equal(groupResult?.kind, "ok");
  assert.equal(groupResult?.changed, true);
  assert.deepEqual((groupParsed.channels as Record<string, unknown>)["gewe-openclaw"], {
    allowFrom: ["wxid_old"],
  });
});

test("GeWe status 会汇总 probe、自身身份、目录和配置摘要", async () => {
  rememberGeweDirectoryObservation({
    accountId: "default",
    senderId: "wxid_seen",
    senderName: "Alice",
    groupId: "room@chatroom",
    groupName: "项目群",
  });
  const cfg = {
    bindings: [
      {
        agentId: "ops",
        match: {
          channel: "gewe-openclaw",
          peer: { kind: "group", id: "room@chatroom" },
        },
      },
    ],
    channels: {
      "gewe-openclaw": {
        token: "token",
        appId: "app-id",
        groupAllowFrom: ["wxid_group"],
        groups: {
          "room@chatroom": {
            allowFrom: ["wxid_room"],
          },
        },
      },
    },
  };
  const account = resolveGeweAccount({ cfg: cfg as never });

  await withMockFetch(
    async (url) => {
      if (url.endsWith("/gewe/v2/api/personal/getProfile")) {
        return new Response(
          JSON.stringify({
            ret: 200,
            msg: "ok",
            data: {
              wxid: "wxid_bot",
              nickName: "Bot",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    },
    async () => {
      const probe = await gewePlugin.status?.probeAccount?.({
        account,
        timeoutMs: 1000,
        cfg: cfg as never,
      });
      assert.equal(probe?.ok, true);
      assert.equal(probe?.self?.wxid, "wxid_bot");

      const snapshot = await gewePlugin.status?.buildAccountSnapshot?.({
        account,
        cfg: cfg as never,
        runtime: {
          accountId: "default",
          running: true,
          lastInboundAt: 111,
          lastOutboundAt: 222,
        },
        probe,
      });
      assert.equal(snapshot?.knownPeersCount, 2);
      assert.equal(snapshot?.knownGroupsCount, 1);
      assert.equal(snapshot?.explicitBindingCount, 1);
      assert.equal(snapshot?.groupOverrideCount, 1);

      const summary = await gewePlugin.status?.buildChannelSummary?.({
        account,
        cfg: cfg as never,
        defaultAccountId: "default",
        snapshot: snapshot as never,
      });
      assert.equal(summary?.apiReachable, true);
      assert.deepEqual(summary?.self, { wxid: "wxid_bot", nickName: "Bot" });
    },
  );
});

test("GeWe status collectStatusIssues 会提示 API 不可达和过宽的群接入配置", () => {
  const issues = gewePlugin.status?.collectStatusIssues?.([
    {
      accountId: "default",
      configured: true,
      enabled: true,
      apiReachable: false,
      lastError: "boom",
      groupPolicy: "open",
      groupOverrideCount: 0,
    } as never,
  ]);

  assert.equal(issues?.length, 2);
  assert.match(String(issues?.[0]?.message ?? ""), /api/i);
  assert.match(String(issues?.[1]?.message ?? ""), /groupPolicy="open"/i);
});

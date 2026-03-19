import assert from "node:assert/strict";
import test from "node:test";

import type { ResolvedGeweAccount } from "./types.js";
import {
  addGroupMemberAsFriendGewe,
  adminOperateGewe,
  agreeJoinRoomGewe,
  createChatroomGewe,
  disbandChatroomGewe,
  getChatroomAnnouncementGewe,
  getChatroomInfoGewe,
  getChatroomMemberDetailGewe,
  getChatroomMemberListGewe,
  getChatroomQrCodeGewe,
  inviteMemberGewe,
  joinRoomUsingQRCodeGewe,
  modifyChatroomNameGewe,
  modifyChatroomNickNameForSelfGewe,
  modifyChatroomRemarkGewe,
  pinChatGewe,
  quitChatroomGewe,
  removeMemberGewe,
  roomAccessApplyCheckApproveGewe,
  saveContractListGewe,
  setChatroomAnnouncementGewe,
  setMsgSilenceGewe,
} from "./groups-api.js";

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
    name: "modifyChatroomNickNameForSelf",
    run: () =>
      modifyChatroomNickNameForSelfGewe({ account, chatroomId: "room@chatroom", nickName: "Bot" }),
    path: "/gewe/v2/api/group/modifyChatroomNickNameForSelf",
    body: { chatroomId: "room@chatroom", nickName: "Bot" },
  },
  {
    name: "modifyChatroomName",
    run: () =>
      modifyChatroomNameGewe({
        account,
        chatroomId: "room@chatroom",
        chatroomName: "项目群",
      }),
    path: "/gewe/v2/api/group/modifyChatroomName",
    body: { chatroomId: "room@chatroom", chatroomName: "项目群" },
  },
  {
    name: "modifyChatroomRemark",
    run: () =>
      modifyChatroomRemarkGewe({
        account,
        chatroomId: "room@chatroom",
        chatroomRemark: "备注",
      }),
    path: "/gewe/v2/api/group/modifyChatroomRemark",
    body: { chatroomId: "room@chatroom", chatroomRemark: "备注" },
  },
  {
    name: "createChatroom",
    run: () => createChatroomGewe({ account, wxids: ["wxid_a", "wxid_b"] }),
    path: "/gewe/v2/api/group/createChatroom",
    body: { wxids: ["wxid_a", "wxid_b"] },
  },
  {
    name: "removeMember",
    run: () => removeMemberGewe({ account, chatroomId: "room@chatroom", wxids: ["wxid_a"] }),
    path: "/gewe/v2/api/group/removeMember",
    body: { chatroomId: "room@chatroom", wxids: ["wxid_a"] },
  },
  {
    name: "agreeJoinRoom",
    run: () => agreeJoinRoomGewe({ account, url: "https://example.com/room-invite" }),
    path: "/gewe/v2/api/group/agreeJoinRoom",
    body: { url: "https://example.com/room-invite" },
  },
  {
    name: "joinRoomUsingQRCode",
    run: () => joinRoomUsingQRCodeGewe({ account, qrUrl: "https://example.com/room-qr" }),
    path: "/gewe/v2/api/group/joinRoomUsingQRCode",
    body: { qrUrl: "https://example.com/room-qr" },
  },
  {
    name: "addGroupMemberAsFriend",
    run: () =>
      addGroupMemberAsFriendGewe({
        account,
        chatroomId: "room@chatroom",
        memberWxid: "wxid_member",
        content: "你好",
      }),
    path: "/gewe/v2/api/group/addGroupMemberAsFriend",
    body: { chatroomId: "room@chatroom", memberWxid: "wxid_member", content: "你好" },
  },
  {
    name: "roomAccessApplyCheckApprove",
    run: () =>
      roomAccessApplyCheckApproveGewe({
        account,
        chatroomId: "room@chatroom",
        newMsgId: "10001",
        msgContent: "申请进群",
      }),
    path: "/gewe/v2/api/group/roomAccessApplyCheckApprove",
    body: { chatroomId: "room@chatroom", newMsgId: "10001", msgContent: "申请进群" },
  },
  {
    name: "adminOperate",
    run: () =>
      adminOperateGewe({
        account,
        chatroomId: "room@chatroom",
        operType: 1,
        wxids: ["wxid_admin"],
      }),
    path: "/gewe/v2/api/group/adminOperate",
    body: { chatroomId: "room@chatroom", operType: 1, wxids: ["wxid_admin"] },
  },
  {
    name: "saveContractList",
    run: () =>
      saveContractListGewe({
        account,
        chatroomId: "room@chatroom",
        operType: 1,
      }),
    path: "/gewe/v2/api/group/saveContractList",
    body: { chatroomId: "room@chatroom", operType: 1 },
  },
  {
    name: "pinChat",
    run: () =>
      pinChatGewe({
        account,
        chatroomId: "room@chatroom",
        top: true,
      }),
    path: "/gewe/v2/api/group/pinChat",
    body: { chatroomId: "room@chatroom", top: true },
  },
  {
    name: "getChatroomQrCode",
    run: () => getChatroomQrCodeGewe({ account, chatroomId: "room@chatroom" }),
    path: "/gewe/v2/api/group/getChatroomQrCode",
    body: { chatroomId: "room@chatroom" },
  },
  {
    name: "getChatroomInfo",
    run: () => getChatroomInfoGewe({ account, chatroomId: "room@chatroom" }),
    path: "/gewe/v2/api/group/getChatroomInfo",
    body: { chatroomId: "room@chatroom" },
  },
  {
    name: "getChatroomAnnouncement",
    run: () => getChatroomAnnouncementGewe({ account, chatroomId: "room@chatroom" }),
    path: "/gewe/v2/api/group/getChatroomAnnouncement",
    body: { chatroomId: "room@chatroom" },
  },
  {
    name: "getChatroomMemberList",
    run: () => getChatroomMemberListGewe({ account, chatroomId: "room@chatroom" }),
    path: "/gewe/v2/api/group/getChatroomMemberList",
    body: { chatroomId: "room@chatroom" },
  },
  {
    name: "getChatroomMemberDetail",
    run: () =>
      getChatroomMemberDetailGewe({
        account,
        chatroomId: "room@chatroom",
        memberWxids: ["wxid_member"],
      }),
    path: "/gewe/v2/api/group/getChatroomMemberDetail",
    body: { chatroomId: "room@chatroom", memberWxids: ["wxid_member"] },
  },
  {
    name: "disbandChatroom",
    run: () => disbandChatroomGewe({ account, chatroomId: "room@chatroom" }),
    path: "/gewe/v2/api/group/disbandChatroom",
    body: { chatroomId: "room@chatroom" },
  },
  {
    name: "setMsgSilence",
    run: () =>
      setMsgSilenceGewe({
        account,
        chatroomId: "room@chatroom",
        silence: true,
      }),
    path: "/gewe/v2/api/group/setMsgSilence",
    body: { chatroomId: "room@chatroom", silence: true },
  },
  {
    name: "setChatroomAnnouncement",
    run: () =>
      setChatroomAnnouncementGewe({
        account,
        chatroomId: "room@chatroom",
        content: "今晚发布",
      }),
    path: "/gewe/v2/api/group/setChatroomAnnouncement",
    body: { chatroomId: "room@chatroom", content: "今晚发布" },
  },
  {
    name: "quitChatroom",
    run: () => quitChatroomGewe({ account, chatroomId: "room@chatroom" }),
    path: "/gewe/v2/api/group/quitChatroom",
    body: { chatroomId: "room@chatroom" },
  },
  {
    name: "inviteMember",
    run: () =>
      inviteMemberGewe({
        account,
        chatroomId: "room@chatroom",
        wxids: ["wxid_a"],
        reason: "项目协作",
      }),
    path: "/gewe/v2/api/group/inviteMember",
    body: { chatroomId: "room@chatroom", wxids: ["wxid_a"], reason: "项目协作" },
  },
] as const;

for (const entry of cases) {
  test(`GeWe 群 API ${entry.name} 会调用官方端点并自动注入 appId`, async () => {
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

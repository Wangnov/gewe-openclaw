import {
  createGeweAccountMethod,
  type GeweApiList,
  type GeweApiObject,
} from "./gewe-account-api.js";

export type GeweChatroomInfo = {
  chatroomId: string;
  nickName?: string;
  remark?: string | null;
  memberList?: Array<{
    wxid?: string;
    nickName?: string | null;
    displayName?: string | null;
  }>;
} & GeweApiObject;

export const modifyChatroomNickNameForSelfGewe = createGeweAccountMethod<{
  chatroomId: string;
  nickName: string;
}>("/gewe/v2/api/group/modifyChatroomNickNameForSelf");

export const modifyChatroomNameGewe = createGeweAccountMethod<{
  chatroomId: string;
  chatroomName: string;
}>("/gewe/v2/api/group/modifyChatroomName");

export const modifyChatroomRemarkGewe = createGeweAccountMethod<{
  chatroomId: string;
  chatroomRemark: string;
}>("/gewe/v2/api/group/modifyChatroomRemark");

export const createChatroomGewe = createGeweAccountMethod<{
  wxids: string[];
}>("/gewe/v2/api/group/createChatroom");

export const removeMemberGewe = createGeweAccountMethod<{
  chatroomId: string;
  wxids: string[];
}>("/gewe/v2/api/group/removeMember");

export const agreeJoinRoomGewe = createGeweAccountMethod<{
  url: string;
}>("/gewe/v2/api/group/agreeJoinRoom");

export const joinRoomUsingQRCodeGewe = createGeweAccountMethod<{
  qrUrl: string;
}>("/gewe/v2/api/group/joinRoomUsingQRCode");

export const addGroupMemberAsFriendGewe = createGeweAccountMethod<{
  chatroomId: string;
  memberWxid: string;
  content: string;
}>("/gewe/v2/api/group/addGroupMemberAsFriend");

export const roomAccessApplyCheckApproveGewe = createGeweAccountMethod<{
  chatroomId: string;
  newMsgId: string | number;
  msgContent: string;
}>("/gewe/v2/api/group/roomAccessApplyCheckApprove");

export const adminOperateGewe = createGeweAccountMethod<{
  chatroomId: string;
  operType: number;
  wxids: string[];
}>("/gewe/v2/api/group/adminOperate");

export const saveContractListGewe = createGeweAccountMethod<{
  chatroomId: string;
  operType: number;
}>("/gewe/v2/api/group/saveContractList");

export const pinChatGewe = createGeweAccountMethod<{
  chatroomId: string;
  top: boolean | number;
}>("/gewe/v2/api/group/pinChat");

export const getChatroomQrCodeGewe = createGeweAccountMethod<{
  chatroomId: string;
}>("/gewe/v2/api/group/getChatroomQrCode");

export const getChatroomInfoGewe = createGeweAccountMethod<{
  chatroomId: string;
}, GeweChatroomInfo>("/gewe/v2/api/group/getChatroomInfo");

export const getChatroomAnnouncementGewe = createGeweAccountMethod<{
  chatroomId: string;
}>("/gewe/v2/api/group/getChatroomAnnouncement");

export const getChatroomMemberListGewe = createGeweAccountMethod<{
  chatroomId: string;
}, GeweApiList>("/gewe/v2/api/group/getChatroomMemberList");

export const getChatroomMemberDetailGewe = createGeweAccountMethod<{
  chatroomId: string;
  memberWxids: string[];
}, GeweApiList>("/gewe/v2/api/group/getChatroomMemberDetail");

export const disbandChatroomGewe = createGeweAccountMethod<{
  chatroomId: string;
}>("/gewe/v2/api/group/disbandChatroom");

export const setMsgSilenceGewe = createGeweAccountMethod<{
  chatroomId: string;
  silence: boolean | number;
}>("/gewe/v2/api/group/setMsgSilence");

export const setChatroomAnnouncementGewe = createGeweAccountMethod<{
  chatroomId: string;
  content: string;
}>("/gewe/v2/api/group/setChatroomAnnouncement");

export const quitChatroomGewe = createGeweAccountMethod<{
  chatroomId: string;
}>("/gewe/v2/api/group/quitChatroom");

export const inviteMemberGewe = createGeweAccountMethod<{
  chatroomId: string;
  wxids: string[];
  reason: string;
}>("/gewe/v2/api/group/inviteMember");

export const geweGroupsApi = {
  modifyChatroomNickNameForSelf: modifyChatroomNickNameForSelfGewe,
  modifyChatroomName: modifyChatroomNameGewe,
  modifyChatroomRemark: modifyChatroomRemarkGewe,
  createChatroom: createChatroomGewe,
  removeMember: removeMemberGewe,
  agreeJoinRoom: agreeJoinRoomGewe,
  joinRoomUsingQRCode: joinRoomUsingQRCodeGewe,
  addGroupMemberAsFriend: addGroupMemberAsFriendGewe,
  roomAccessApplyCheckApprove: roomAccessApplyCheckApproveGewe,
  adminOperate: adminOperateGewe,
  saveContractList: saveContractListGewe,
  pinChat: pinChatGewe,
  getChatroomQrCode: getChatroomQrCodeGewe,
  getChatroomInfo: getChatroomInfoGewe,
  getChatroomAnnouncement: getChatroomAnnouncementGewe,
  getChatroomMemberList: getChatroomMemberListGewe,
  getChatroomMemberDetail: getChatroomMemberDetailGewe,
  disbandChatroom: disbandChatroomGewe,
  setMsgSilence: setMsgSilenceGewe,
  setChatroomAnnouncement: setChatroomAnnouncementGewe,
  quitChatroom: quitChatroomGewe,
  inviteMember: inviteMemberGewe,
};

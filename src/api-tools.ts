import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk";
import { z } from "zod";

import { resolveGeweAccount } from "./accounts.js";
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
import { inferCurrentGeweGroupId, normalizeGeweBindingConversationId } from "./group-binding.js";
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
import { normalizeGeweMessagingTarget } from "./normalize.js";
import { normalizeAccountId, type OpenClawConfig } from "./openclaw-compat.js";
import {
  getProfileGewe,
  getQrCodeGewe,
  getSafetyInfoGewe,
  privacySettingsGewe,
  updateHeadImgGewe,
  updateProfileGewe,
} from "./personal-api.js";
import type { CoreConfig, ResolvedGeweAccount } from "./types.js";

const ContactsActionSchema = z.enum([
  "list",
  "list_cache",
  "brief",
  "detail",
  "search",
  "search_im",
  "im_detail",
  "check_relation",
  "set_remark",
  "set_only_chat",
  "delete",
  "add",
  "add_im",
  "sync_im",
  "phones_get",
  "phones_upload",
]);

const GroupsActionSchema = z.enum([
  "info",
  "announcement",
  "members",
  "member_detail",
  "qr_code",
  "set_self_nickname",
  "rename",
  "set_remark",
  "create",
  "remove_members",
  "agree_join",
  "join_via_qr",
  "add_member_as_friend",
  "approve_join_request",
  "admin_operate",
  "save_to_contacts",
  "pin",
  "disband",
  "set_silence",
  "set_announcement",
  "quit",
  "invite",
]);

const MomentsActionSchema = z.enum([
  "list_self",
  "list_contact",
  "detail",
  "download_video",
  "upload_image",
  "upload_video",
  "delete",
  "post_text",
  "post_image",
  "post_video",
  "post_link",
  "set_stranger_visibility",
  "set_visible_scope",
  "set_privacy",
  "like",
  "comment",
  "forward",
]);

const PersonalActionSchema = z.enum([
  "profile",
  "qrcode",
  "safety_info",
  "update_profile",
  "update_avatar",
  "privacy",
]);

const FlexibleObjectSchema = z.object({}).catchall(z.unknown());

const ContactsToolSchema = z
  .object({
    action: ContactsActionSchema,
    accountId: z.string().optional(),
    wxid: z.string().optional(),
    wxids: z.array(z.string()).optional(),
    scene: z.number().int().optional(),
    option: z.number().int().optional(),
    content: z.string().optional(),
    v3: z.string().optional(),
    v4: z.string().optional(),
    toUserName: z.string().optional(),
    phones: z.array(z.string()).optional(),
    opType: z.number().int().optional(),
    remark: z.string().optional(),
    onlyChat: z.boolean().optional(),
    contactsInfo: z.string().optional(),
  })
  .strict();

const GroupsToolSchema = z
  .object({
    action: GroupsActionSchema,
    accountId: z.string().optional(),
    groupId: z.string().optional(),
    nickName: z.string().optional(),
    chatroomName: z.string().optional(),
    remark: z.string().optional(),
    wxids: z.array(z.string()).optional(),
    memberWxids: z.array(z.string()).optional(),
    memberWxid: z.string().optional(),
    url: z.string().optional(),
    qrUrl: z.string().optional(),
    content: z.string().optional(),
    msgContent: z.string().optional(),
    newMsgId: z.union([z.string(), z.number().int()]).optional(),
    operType: z.number().int().optional(),
    top: z.union([z.boolean(), z.number().int()]).optional(),
    silence: z.union([z.boolean(), z.number().int()]).optional(),
    reason: z.string().optional(),
  })
  .strict();

const MomentsToolSchema = z
  .object({
    action: MomentsActionSchema,
    accountId: z.string().optional(),
    wxid: z.string().optional(),
    snsId: z.string().optional(),
    snsXml: z.string().optional(),
    imgUrls: z.array(z.string()).optional(),
    thumbUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    imgInfos: z.array(FlexibleObjectSchema).optional(),
    videoInfo: FlexibleObjectSchema.optional(),
    content: z.string().optional(),
    linkUrl: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    option: z.number().int().optional(),
    open: z.boolean().optional(),
    operType: z.number().int().optional(),
    commentId: z.union([z.string(), z.number().int()]).optional(),
    allowWxIds: z.array(z.string()).optional(),
    atWxIds: z.array(z.string()).optional(),
    disableWxIds: z.array(z.string()).optional(),
    privacy: z.number().int().optional(),
    allowTagIds: z.array(z.union([z.string(), z.number().int()])).optional(),
    disableTagIds: z.array(z.union([z.string(), z.number().int()])).optional(),
    maxId: z.union([z.string(), z.number().int()]).optional(),
    decrypt: z.boolean().optional(),
    firstPageMd5: z.string().optional(),
  })
  .strict();

const PersonalToolSchema = z
  .object({
    action: PersonalActionSchema,
    accountId: z.string().optional(),
    country: z.string().optional(),
    province: z.string().optional(),
    city: z.string().optional(),
    nickName: z.string().optional(),
    sex: z.number().int().optional(),
    signature: z.string().optional(),
    headImgUrl: z.string().optional(),
    option: z.number().int().optional(),
    open: z.boolean().optional(),
  })
  .strict();

type ContactsToolParams = z.infer<typeof ContactsToolSchema>;
type GroupsToolParams = z.infer<typeof GroupsToolSchema>;
type MomentsToolParams = z.infer<typeof MomentsToolSchema>;
type PersonalToolParams = z.infer<typeof PersonalToolSchema>;

function jsonToolResult(details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }],
    details,
  };
}

function unknownToolActionResult(tool: string, action: unknown) {
  return jsonToolResult({
    ok: false,
    tool,
    error: `Unknown action: ${String(action)}`,
  });
}

function toolExecutionErrorResult(tool: string, action: unknown, error: unknown) {
  return jsonToolResult({
    ok: false,
    tool,
    action: typeof action === "string" ? action : undefined,
    error: error instanceof Error ? error.message : String(error),
  });
}

function resolveToolConfig(ctx: OpenClawPluginToolContext): OpenClawConfig {
  return (ctx.config ?? {}) as OpenClawConfig;
}

function resolveGeweToolAccount(params: {
  ctx: OpenClawPluginToolContext;
  rawAccountId?: string;
}): { cfg: OpenClawConfig; account: ResolvedGeweAccount } {
  const cfg = resolveToolConfig(params.ctx);
  const account = resolveGeweAccount({
    cfg: cfg as CoreConfig,
    accountId: normalizeAccountId(params.rawAccountId ?? params.ctx.agentAccountId ?? "default"),
  });
  if (!account.token || !account.appId) {
    throw new Error(`GeWe account "${account.accountId}" is not fully configured with token and appId.`);
  }
  return { cfg, account };
}

function dedupeStrings(values: readonly unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeWxidList(values: readonly unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeGeweMessagingTarget(String(value ?? "").trim());
    if (!normalized || normalized.endsWith("@chatroom") || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function extractSessionScopedTarget(
  sessionKey: string | undefined,
  markers: string[],
): string | undefined {
  const raw = sessionKey?.trim();
  if (!raw) {
    return undefined;
  }
  const lowered = raw.toLowerCase();
  for (const marker of markers) {
    const index = lowered.indexOf(marker);
    if (index === -1) {
      continue;
    }
    const value = raw.slice(index + marker.length).trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function inferCurrentGeweDirectWxid(ctx: OpenClawPluginToolContext): string | undefined {
  const fromSession = extractSessionScopedTarget(ctx.sessionKey, [
    ":gewe-openclaw:direct:",
    ":gewe-openclaw:dm:",
    ":gewe:direct:",
    ":gewe:dm:",
  ]);
  const normalizedSession = normalizeGeweMessagingTarget(fromSession ?? "");
  if (normalizedSession && !normalizedSession.endsWith("@chatroom")) {
    return normalizedSession;
  }

  const normalizedRequester = normalizeGeweMessagingTarget(ctx.requesterSenderId ?? "");
  if (normalizedRequester && !normalizedRequester.endsWith("@chatroom")) {
    return normalizedRequester;
  }
  return undefined;
}

function resolveDirectWxids(params: {
  ctx: OpenClawPluginToolContext;
  wxids?: readonly string[];
}): string[] {
  const explicit = normalizeWxidList(params.wxids ?? []);
  if (explicit.length > 0) {
    return explicit;
  }
  const inferred = inferCurrentGeweDirectWxid(params.ctx);
  if (!inferred) {
    throw new Error("This action requires wxids, or a current GeWe direct-message session to infer one.");
  }
  return [inferred];
}

function resolveSingleWxid(params: {
  ctx: OpenClawPluginToolContext;
  rawWxid?: string;
  fieldLabel: string;
}): string {
  const explicit = normalizeWxidList([params.rawWxid ?? ""]);
  if (explicit.length > 0) {
    return explicit[0]!;
  }
  const inferred = inferCurrentGeweDirectWxid(params.ctx);
  if (!inferred) {
    throw new Error(
      `This action requires ${params.fieldLabel}, or a current GeWe direct-message session to infer one.`,
    );
  }
  return inferred;
}

function resolveGroupId(params: {
  cfg: OpenClawConfig;
  accountId: string;
  ctx: OpenClawPluginToolContext;
  rawGroupId?: string;
}): string {
  const explicit = normalizeGeweBindingConversationId(params.rawGroupId);
  if (explicit) {
    return explicit;
  }
  const inferred = inferCurrentGeweGroupId({
    cfg: params.cfg,
    accountId: params.accountId,
    sessionKey: params.ctx.sessionKey,
  });
  if (!inferred) {
    throw new Error("This action requires groupId, or a current GeWe group session that can infer one.");
  }
  return inferred;
}

function requireString(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${label} is required for this action.`);
  }
  return trimmed;
}

function requireNumber(value: number | undefined, label: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} is required for this action.`);
  }
  return value;
}

function requireBoolean(value: boolean | undefined, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} is required for this action.`);
  }
  return value;
}

function requireStringArray(values: readonly string[] | undefined, label: string): string[] {
  const normalized = dedupeStrings(values ?? []);
  if (normalized.length === 0) {
    throw new Error(`${label} is required for this action.`);
  }
  return normalized;
}

function requireWxidArray(values: readonly string[] | undefined, label: string): string[] {
  const normalized = normalizeWxidList(values ?? []);
  if (normalized.length === 0) {
    throw new Error(`${label} is required for this action.`);
  }
  return normalized;
}

function requireObjectArray(
  values: Array<Record<string, unknown>> | undefined,
  label: string,
): Array<Record<string, unknown>> {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} is required for this action.`);
  }
  return values;
}

function requireObject(value: Record<string, unknown> | undefined, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is required for this action.`);
  }
  return value;
}

function buildMomentsVisibilityInput(params: MomentsToolParams) {
  return {
    ...(params.allowWxIds ? { allowWxIds: dedupeStrings(params.allowWxIds) } : {}),
    ...(params.atWxIds ? { atWxIds: dedupeStrings(params.atWxIds) } : {}),
    ...(params.disableWxIds ? { disableWxIds: dedupeStrings(params.disableWxIds) } : {}),
    ...(typeof params.privacy === "number" ? { privacy: params.privacy } : {}),
    ...(params.allowTagIds ? { allowTagIds: params.allowTagIds } : {}),
    ...(params.disableTagIds ? { disableTagIds: params.disableTagIds } : {}),
  };
}

async function executeContactsTool(
  ctx: OpenClawPluginToolContext,
  params: ContactsToolParams,
) {
  const { account } = resolveGeweToolAccount({
    ctx,
    rawAccountId: params.accountId,
  });

  switch (params.action) {
    case "list":
      return {
        input: {},
        data: await fetchContactsListGewe({ account }),
      };
    case "list_cache":
      return {
        input: {},
        data: await fetchContactsListCacheGewe({ account }),
      };
    case "brief": {
      const wxids = resolveDirectWxids({ ctx, wxids: params.wxids });
      return {
        input: { wxids },
        data: await getBriefInfoGewe({ account, wxids }),
      };
    }
    case "detail": {
      const wxids = resolveDirectWxids({ ctx, wxids: params.wxids });
      return {
        input: { wxids },
        data: await getDetailInfoGewe({ account, wxids }),
      };
    }
    case "search":
      return {
        input: { contactsInfo: requireString(params.contactsInfo, "contactsInfo") },
        data: await searchContactGewe({
          account,
          contactsInfo: requireString(params.contactsInfo, "contactsInfo"),
        }),
      };
    case "search_im":
      return {
        input: {
          scene: requireNumber(params.scene, "scene"),
          content: requireString(params.content, "content"),
        },
        data: await searchImContactGewe({
          account,
          scene: requireNumber(params.scene, "scene"),
          content: requireString(params.content, "content"),
        }),
      };
    case "im_detail":
      return {
        input: { toUserName: requireString(params.toUserName, "toUserName") },
        data: await getImContactDetailGewe({
          account,
          toUserName: requireString(params.toUserName, "toUserName"),
        }),
      };
    case "check_relation": {
      const wxids = resolveDirectWxids({ ctx, wxids: params.wxids });
      return {
        input: { wxids },
        data: await checkRelationGewe({ account, wxids }),
      };
    }
    case "set_remark": {
      const wxid = resolveSingleWxid({
        ctx,
        rawWxid: params.wxid,
        fieldLabel: "wxid",
      });
      const remark = requireString(params.remark, "remark");
      return {
        input: { wxid, remark },
        data: await setFriendRemarkGewe({ account, wxid, remark }),
      };
    }
    case "set_only_chat": {
      const wxid = resolveSingleWxid({
        ctx,
        rawWxid: params.wxid,
        fieldLabel: "wxid",
      });
      const onlyChat = requireBoolean(params.onlyChat, "onlyChat");
      return {
        input: { wxid, onlyChat },
        data: await setFriendPermissionsGewe({ account, wxid, onlyChat }),
      };
    }
    case "delete": {
      const wxid = resolveSingleWxid({
        ctx,
        rawWxid: params.wxid,
        fieldLabel: "wxid",
      });
      return {
        input: { wxid },
        data: await deleteFriendGewe({ account, wxid }),
      };
    }
    case "add":
      return {
        input: {
          scene: requireNumber(params.scene, "scene"),
          option: requireNumber(params.option, "option"),
          v3: requireString(params.v3, "v3"),
          v4: requireString(params.v4, "v4"),
          content: requireString(params.content, "content"),
        },
        data: await addContactsGewe({
          account,
          scene: requireNumber(params.scene, "scene"),
          option: requireNumber(params.option, "option"),
          v3: requireString(params.v3, "v3"),
          v4: requireString(params.v4, "v4"),
          content: requireString(params.content, "content"),
        }),
      };
    case "add_im":
      return {
        input: {
          v3: requireString(params.v3, "v3"),
          v4: requireString(params.v4, "v4"),
        },
        data: await addImContactGewe({
          account,
          v3: requireString(params.v3, "v3"),
          v4: requireString(params.v4, "v4"),
        }),
      };
    case "sync_im":
      return {
        input: {},
        data: await syncImContactsGewe({ account }),
      };
    case "phones_get":
      return {
        input: {
          ...(params.phones ? { phones: dedupeStrings(params.phones) } : {}),
        },
        data: await getPhoneAddressListGewe({
          account,
          ...(params.phones ? { phones: dedupeStrings(params.phones) } : {}),
        }),
      };
    case "phones_upload": {
      const phones = requireStringArray(params.phones, "phones");
      const opType = requireNumber(params.opType, "opType");
      return {
        input: { phones, opType },
        data: await uploadPhoneAddressListGewe({ account, phones, opType }),
      };
    }
    default:
      return unknownToolActionResult("gewe_contacts", params.action);
  }
}

async function executeGroupsTool(
  ctx: OpenClawPluginToolContext,
  params: GroupsToolParams,
) {
  const { cfg, account } = resolveGeweToolAccount({
    ctx,
    rawAccountId: params.accountId,
  });

  const resolveCurrentGroupId = () =>
    resolveGroupId({
      cfg,
      accountId: account.accountId,
      ctx,
      rawGroupId: params.groupId,
    });

  switch (params.action) {
    case "info": {
      const groupId = resolveCurrentGroupId();
      return {
        input: { groupId },
        data: await getChatroomInfoGewe({ account, chatroomId: groupId }),
      };
    }
    case "announcement": {
      const groupId = resolveCurrentGroupId();
      return {
        input: { groupId },
        data: await getChatroomAnnouncementGewe({ account, chatroomId: groupId }),
      };
    }
    case "members": {
      const groupId = resolveCurrentGroupId();
      return {
        input: { groupId },
        data: await getChatroomMemberListGewe({ account, chatroomId: groupId }),
      };
    }
    case "member_detail": {
      const groupId = resolveCurrentGroupId();
      const memberWxids = requireWxidArray(params.memberWxids, "memberWxids");
      return {
        input: { groupId, memberWxids },
        data: await getChatroomMemberDetailGewe({ account, chatroomId: groupId, memberWxids }),
      };
    }
    case "qr_code": {
      const groupId = resolveCurrentGroupId();
      return {
        input: { groupId },
        data: await getChatroomQrCodeGewe({ account, chatroomId: groupId }),
      };
    }
    case "set_self_nickname": {
      const groupId = resolveCurrentGroupId();
      const nickName = requireString(params.nickName, "nickName");
      return {
        input: { groupId, nickName },
        data: await modifyChatroomNickNameForSelfGewe({ account, chatroomId: groupId, nickName }),
      };
    }
    case "rename": {
      const groupId = resolveCurrentGroupId();
      const chatroomName = requireString(params.chatroomName, "chatroomName");
      return {
        input: { groupId, chatroomName },
        data: await modifyChatroomNameGewe({ account, chatroomId: groupId, chatroomName }),
      };
    }
    case "set_remark": {
      const groupId = resolveCurrentGroupId();
      const chatroomRemark = requireString(params.remark, "remark");
      return {
        input: { groupId, chatroomRemark },
        data: await modifyChatroomRemarkGewe({ account, chatroomId: groupId, chatroomRemark }),
      };
    }
    case "create": {
      const wxids = requireWxidArray(params.wxids, "wxids");
      return {
        input: { wxids },
        data: await createChatroomGewe({ account, wxids }),
      };
    }
    case "remove_members": {
      const groupId = resolveCurrentGroupId();
      const wxids = requireWxidArray(params.wxids, "wxids");
      return {
        input: { groupId, wxids },
        data: await removeMemberGewe({ account, chatroomId: groupId, wxids }),
      };
    }
    case "agree_join":
      return {
        input: { url: requireString(params.url, "url") },
        data: await agreeJoinRoomGewe({ account, url: requireString(params.url, "url") }),
      };
    case "join_via_qr":
      return {
        input: { qrUrl: requireString(params.qrUrl, "qrUrl") },
        data: await joinRoomUsingQRCodeGewe({ account, qrUrl: requireString(params.qrUrl, "qrUrl") }),
      };
    case "add_member_as_friend": {
      const groupId = resolveCurrentGroupId();
      const memberWxid = resolveSingleWxid({
        ctx,
        rawWxid: params.memberWxid,
        fieldLabel: "memberWxid",
      });
      const content = requireString(params.content, "content");
      return {
        input: { groupId, memberWxid, content },
        data: await addGroupMemberAsFriendGewe({
          account,
          chatroomId: groupId,
          memberWxid,
          content,
        }),
      };
    }
    case "approve_join_request": {
      const groupId = resolveCurrentGroupId();
      const newMsgId = params.newMsgId;
      if (typeof newMsgId !== "string" && typeof newMsgId !== "number") {
        throw new Error("newMsgId is required for this action.");
      }
      const msgContent = requireString(params.msgContent, "msgContent");
      return {
        input: { groupId, newMsgId, msgContent },
        data: await roomAccessApplyCheckApproveGewe({
          account,
          chatroomId: groupId,
          newMsgId,
          msgContent,
        }),
      };
    }
    case "admin_operate": {
      const groupId = resolveCurrentGroupId();
      const operType = requireNumber(params.operType, "operType");
      const wxids = requireWxidArray(params.wxids, "wxids");
      return {
        input: { groupId, operType, wxids },
        data: await adminOperateGewe({ account, chatroomId: groupId, operType, wxids }),
      };
    }
    case "save_to_contacts": {
      const groupId = resolveCurrentGroupId();
      const operType = requireNumber(params.operType, "operType");
      return {
        input: { groupId, operType },
        data: await saveContractListGewe({ account, chatroomId: groupId, operType }),
      };
    }
    case "pin": {
      const groupId = resolveCurrentGroupId();
      if (typeof params.top !== "boolean" && typeof params.top !== "number") {
        throw new Error("top is required for this action.");
      }
      return {
        input: { groupId, top: params.top },
        data: await pinChatGewe({ account, chatroomId: groupId, top: params.top }),
      };
    }
    case "disband": {
      const groupId = resolveCurrentGroupId();
      return {
        input: { groupId },
        data: await disbandChatroomGewe({ account, chatroomId: groupId }),
      };
    }
    case "set_silence": {
      const groupId = resolveCurrentGroupId();
      if (typeof params.silence !== "boolean" && typeof params.silence !== "number") {
        throw new Error("silence is required for this action.");
      }
      return {
        input: { groupId, silence: params.silence },
        data: await setMsgSilenceGewe({ account, chatroomId: groupId, silence: params.silence }),
      };
    }
    case "set_announcement": {
      const groupId = resolveCurrentGroupId();
      const content = requireString(params.content, "content");
      return {
        input: { groupId, content },
        data: await setChatroomAnnouncementGewe({ account, chatroomId: groupId, content }),
      };
    }
    case "quit": {
      const groupId = resolveCurrentGroupId();
      return {
        input: { groupId },
        data: await quitChatroomGewe({ account, chatroomId: groupId }),
      };
    }
    case "invite": {
      const groupId = resolveCurrentGroupId();
      const wxids = requireWxidArray(params.wxids, "wxids");
      const reason = requireString(params.reason, "reason");
      return {
        input: { groupId, wxids, reason },
        data: await inviteMemberGewe({ account, chatroomId: groupId, wxids, reason }),
      };
    }
    default:
      return unknownToolActionResult("gewe_groups", params.action);
  }
}

async function executeMomentsTool(
  ctx: OpenClawPluginToolContext,
  params: MomentsToolParams,
) {
  const { account } = resolveGeweToolAccount({
    ctx,
    rawAccountId: params.accountId,
  });
  const visibilityInput = buildMomentsVisibilityInput(params);

  switch (params.action) {
    case "list_self":
      return {
        input: {
          ...(params.maxId !== undefined ? { maxId: params.maxId } : {}),
          ...(params.decrypt !== undefined ? { decrypt: params.decrypt } : {}),
          ...(params.firstPageMd5 ? { firstPageMd5: params.firstPageMd5 } : {}),
        },
        data: await snsListGewe({
          account,
          ...(params.maxId !== undefined ? { maxId: params.maxId } : {}),
          ...(params.decrypt !== undefined ? { decrypt: params.decrypt } : {}),
          ...(params.firstPageMd5 ? { firstPageMd5: params.firstPageMd5 } : {}),
        }),
      };
    case "list_contact": {
      const wxid = resolveSingleWxid({
        ctx,
        rawWxid: params.wxid,
        fieldLabel: "wxid",
      });
      return {
        input: {
          wxid,
          ...(params.maxId !== undefined ? { maxId: params.maxId } : {}),
          ...(params.decrypt !== undefined ? { decrypt: params.decrypt } : {}),
          ...(params.firstPageMd5 ? { firstPageMd5: params.firstPageMd5 } : {}),
        },
        data: await contactsSnsListGewe({
          account,
          wxid,
          ...(params.maxId !== undefined ? { maxId: params.maxId } : {}),
          ...(params.decrypt !== undefined ? { decrypt: params.decrypt } : {}),
          ...(params.firstPageMd5 ? { firstPageMd5: params.firstPageMd5 } : {}),
        }),
      };
    }
    case "detail": {
      const snsId = requireString(params.snsId, "snsId");
      return {
        input: { snsId },
        data: await snsDetailsGewe({ account, snsId }),
      };
    }
    case "download_video": {
      const snsXml = requireString(params.snsXml, "snsXml");
      return {
        input: { snsXml },
        data: await downloadSnsVideoGewe({ account, snsXml }),
      };
    }
    case "upload_image": {
      const imgUrls = requireStringArray(params.imgUrls, "imgUrls");
      return {
        input: { imgUrls },
        data: await uploadSnsImageGewe({ account, imgUrls }),
      };
    }
    case "upload_video": {
      const thumbUrl = requireString(params.thumbUrl, "thumbUrl");
      const videoUrl = requireString(params.videoUrl, "videoUrl");
      return {
        input: { thumbUrl, videoUrl },
        data: await uploadSnsVideoGewe({ account, thumbUrl, videoUrl }),
      };
    }
    case "delete": {
      const snsId = requireString(params.snsId, "snsId");
      return {
        input: { snsId },
        data: await delSnsGewe({ account, snsId }),
      };
    }
    case "post_text": {
      const content = requireString(params.content, "content");
      return {
        input: { content, ...visibilityInput },
        data: await sendTextSnsGewe({ account, content, ...visibilityInput }),
      };
    }
    case "post_image": {
      const imgInfos = requireObjectArray(params.imgInfos, "imgInfos");
      return {
        input: {
          imgInfos,
          ...(params.content ? { content: params.content } : {}),
          ...visibilityInput,
        },
        data: await sendImgSnsGewe({
          account,
          imgInfos,
          ...(params.content ? { content: params.content } : {}),
          ...visibilityInput,
        }),
      };
    }
    case "post_video": {
      const videoInfo = requireObject(params.videoInfo, "videoInfo");
      return {
        input: {
          videoInfo,
          ...(params.content ? { content: params.content } : {}),
          ...visibilityInput,
        },
        data: await sendVideoSnsGewe({
          account,
          videoInfo,
          ...(params.content ? { content: params.content } : {}),
          ...visibilityInput,
        }),
      };
    }
    case "post_link": {
      const thumbUrl = requireString(params.thumbUrl, "thumbUrl");
      const linkUrl = requireString(params.linkUrl, "linkUrl");
      const title = requireString(params.title, "title");
      const description = requireString(params.description, "description");
      return {
        input: {
          thumbUrl,
          linkUrl,
          title,
          description,
          ...(params.content ? { content: params.content } : {}),
          ...visibilityInput,
        },
        data: await sendUrlSnsGewe({
          account,
          thumbUrl,
          linkUrl,
          title,
          description,
          ...(params.content ? { content: params.content } : {}),
          ...visibilityInput,
        }),
      };
    }
    case "set_stranger_visibility": {
      const enabled = requireBoolean(params.enabled, "enabled");
      return {
        input: { enabled },
        data: await strangerVisibilityEnabledGewe({ account, enabled }),
      };
    }
    case "set_visible_scope": {
      const option = requireNumber(params.option, "option");
      return {
        input: { option },
        data: await snsVisibleScopeGewe({ account, option }),
      };
    }
    case "set_privacy": {
      const snsId = requireString(params.snsId, "snsId");
      const open = requireBoolean(params.open, "open");
      return {
        input: { snsId, open },
        data: await snsSetPrivacyGewe({ account, snsId, open }),
      };
    }
    case "like": {
      const snsId = requireString(params.snsId, "snsId");
      const operType = requireNumber(params.operType, "operType");
      const wxid = resolveSingleWxid({
        ctx,
        rawWxid: params.wxid,
        fieldLabel: "wxid",
      });
      return {
        input: { snsId, operType, wxid },
        data: await likeSnsGewe({ account, snsId, operType, wxid }),
      };
    }
    case "comment": {
      const snsId = requireString(params.snsId, "snsId");
      const operType = requireNumber(params.operType, "operType");
      const wxid = resolveSingleWxid({
        ctx,
        rawWxid: params.wxid,
        fieldLabel: "wxid",
      });
      return {
        input: {
          snsId,
          operType,
          wxid,
          ...(params.commentId !== undefined ? { commentId: params.commentId } : {}),
          ...(params.content ? { content: params.content } : {}),
        },
        data: await commentSnsGewe({
          account,
          snsId,
          operType,
          wxid,
          ...(params.commentId !== undefined ? { commentId: params.commentId } : {}),
          ...(params.content ? { content: params.content } : {}),
        }),
      };
    }
    case "forward": {
      const snsXml = requireString(params.snsXml, "snsXml");
      return {
        input: { snsXml, ...visibilityInput },
        data: await forwardSnsGewe({ account, snsXml, ...visibilityInput }),
      };
    }
    default:
      return unknownToolActionResult("gewe_moments", params.action);
  }
}

async function executePersonalTool(
  ctx: OpenClawPluginToolContext,
  params: PersonalToolParams,
) {
  const { account } = resolveGeweToolAccount({
    ctx,
    rawAccountId: params.accountId,
  });

  switch (params.action) {
    case "profile":
      return {
        input: {},
        data: await getProfileGewe({ account }),
      };
    case "qrcode":
      return {
        input: {},
        data: await getQrCodeGewe({ account }),
      };
    case "safety_info":
      return {
        input: {},
        data: await getSafetyInfoGewe({ account }),
      };
    case "update_profile": {
      const country = requireString(params.country, "country");
      const province = requireString(params.province, "province");
      const nickName = requireString(params.nickName, "nickName");
      const sex = requireNumber(params.sex, "sex");
      const signature = requireString(params.signature, "signature");
      return {
        input: {
          country,
          province,
          nickName,
          sex,
          signature,
          ...(params.city ? { city: params.city.trim() } : {}),
        },
        data: await updateProfileGewe({
          account,
          country,
          province,
          nickName,
          sex,
          signature,
          ...(params.city ? { city: params.city.trim() } : {}),
        }),
      };
    }
    case "update_avatar": {
      const headImgUrl = requireString(params.headImgUrl, "headImgUrl");
      return {
        input: { headImgUrl },
        data: await updateHeadImgGewe({ account, headImgUrl }),
      };
    }
    case "privacy": {
      const open = requireBoolean(params.open, "open");
      return {
        input: {
          open,
          ...(typeof params.option === "number" ? { option: params.option } : {}),
        },
        data: await privacySettingsGewe({
          account,
          open,
          ...(typeof params.option === "number" ? { option: params.option } : {}),
        }),
      };
    }
    default:
      return unknownToolActionResult("gewe_personal", params.action);
  }
}

export function createGeweApiTools(ctx: OpenClawPluginToolContext): AnyAgentTool[] {
  return [
    {
      name: "gewe_contacts",
      label: "GeWe Contacts",
      description:
        "GeWe contacts operations. Actions: list, list_cache, brief, detail, search, search_im, im_detail, check_relation, set_remark, set_only_chat, delete, add, add_im, sync_im, phones_get, phones_upload.",
      ownerOnly: true,
      parameters: ContactsToolSchema,
      execute: async (_toolCallId, rawParams) => {
        const params = ContactsToolSchema.parse(rawParams ?? {});
        try {
          const result = await executeContactsTool(ctx, params);
          if ("details" in result) {
            return result;
          }
          return jsonToolResult({
            ok: true,
            tool: "gewe_contacts",
            action: params.action,
            accountId: resolveGeweToolAccount({ ctx, rawAccountId: params.accountId }).account.accountId,
            input: result.input,
            data: result.data,
          });
        } catch (error) {
          return toolExecutionErrorResult("gewe_contacts", params.action, error);
        }
      },
    },
    {
      name: "gewe_groups",
      label: "GeWe Groups",
      description:
        "GeWe group operations. Actions: info, announcement, members, member_detail, qr_code, set_self_nickname, rename, set_remark, create, remove_members, agree_join, join_via_qr, add_member_as_friend, approve_join_request, admin_operate, save_to_contacts, pin, disband, set_silence, set_announcement, quit, invite.",
      ownerOnly: true,
      parameters: GroupsToolSchema,
      execute: async (_toolCallId, rawParams) => {
        const params = GroupsToolSchema.parse(rawParams ?? {});
        try {
          const result = await executeGroupsTool(ctx, params);
          if ("details" in result) {
            return result;
          }
          return jsonToolResult({
            ok: true,
            tool: "gewe_groups",
            action: params.action,
            accountId: resolveGeweToolAccount({ ctx, rawAccountId: params.accountId }).account.accountId,
            input: result.input,
            data: result.data,
          });
        } catch (error) {
          return toolExecutionErrorResult("gewe_groups", params.action, error);
        }
      },
    },
    {
      name: "gewe_moments",
      label: "GeWe Moments",
      description:
        "GeWe Moments operations. Actions: list_self, list_contact, detail, download_video, upload_image, upload_video, delete, post_text, post_image, post_video, post_link, set_stranger_visibility, set_visible_scope, set_privacy, like, comment, forward.",
      ownerOnly: true,
      parameters: MomentsToolSchema,
      execute: async (_toolCallId, rawParams) => {
        const params = MomentsToolSchema.parse(rawParams ?? {});
        try {
          const result = await executeMomentsTool(ctx, params);
          if ("details" in result) {
            return result;
          }
          return jsonToolResult({
            ok: true,
            tool: "gewe_moments",
            action: params.action,
            accountId: resolveGeweToolAccount({ ctx, rawAccountId: params.accountId }).account.accountId,
            input: result.input,
            data: result.data,
          });
        } catch (error) {
          return toolExecutionErrorResult("gewe_moments", params.action, error);
        }
      },
    },
    {
      name: "gewe_personal",
      label: "GeWe Personal",
      description:
        "GeWe personal-account operations. Actions: profile, qrcode, safety_info, update_profile, update_avatar, privacy.",
      ownerOnly: true,
      parameters: PersonalToolSchema,
      execute: async (_toolCallId, rawParams) => {
        const params = PersonalToolSchema.parse(rawParams ?? {});
        try {
          const result = await executePersonalTool(ctx, params);
          if ("details" in result) {
            return result;
          }
          return jsonToolResult({
            ok: true,
            tool: "gewe_personal",
            action: params.action,
            accountId: resolveGeweToolAccount({ ctx, rawAccountId: params.accountId }).account.accountId,
            input: result.input,
            data: result.data,
          });
        } catch (error) {
          return toolExecutionErrorResult("gewe_personal", params.action, error);
        }
      },
    },
  ];
}

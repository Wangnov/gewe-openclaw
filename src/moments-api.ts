import {
  createGeweAccountMethod,
  type GeweApiList,
  type GeweApiObject,
} from "./gewe-account-api.js";

type GeweTagId = string | number;

type GeweSnsVisibilityParams = {
  allowWxIds?: string[];
  atWxIds?: string[];
  disableWxIds?: string[];
  privacy?: number;
  allowTagIds?: GeweTagId[];
  disableTagIds?: GeweTagId[];
};

export type GeweSnsImageInfo = GeweApiObject;
export type GeweSnsVideoInfo = GeweApiObject;

export const uploadSnsImageGewe = createGeweAccountMethod<{
  imgUrls: string[];
}>("/gewe/v2/api/sns/uploadSnsImage");

export const uploadSnsVideoGewe = createGeweAccountMethod<{
  thumbUrl: string;
  videoUrl: string;
}>("/gewe/v2/api/sns/uploadSnsVideo");

export const downloadSnsVideoGewe = createGeweAccountMethod<{
  snsXml: string;
}>("/gewe/v2/api/sns/downloadSnsVideo");

export const delSnsGewe = createGeweAccountMethod<{
  snsId: string;
}>("/gewe/v2/api/sns/delSns");

export const sendImgSnsGewe = createGeweAccountMethod<
  GeweSnsVisibilityParams & {
    content?: string;
    imgInfos: GeweSnsImageInfo[];
  }
>("/gewe/v2/api/sns/sendImgSns");

export const sendTextSnsGewe = createGeweAccountMethod<
  GeweSnsVisibilityParams & {
    content: string;
  }
>("/gewe/v2/api/sns/sendTextSns");

export const sendVideoSnsGewe = createGeweAccountMethod<
  GeweSnsVisibilityParams & {
    content?: string;
    videoInfo: GeweSnsVideoInfo;
  }
>("/gewe/v2/api/sns/sendVideoSns");

export const sendUrlSnsGewe = createGeweAccountMethod<
  GeweSnsVisibilityParams & {
    content?: string;
    thumbUrl: string;
    linkUrl: string;
    title: string;
    description: string;
  }
>("/gewe/v2/api/sns/sendUrlSns");

export const strangerVisibilityEnabledGewe = createGeweAccountMethod<{
  enabled: boolean;
}>("/gewe/v2/api/sns/strangerVisibilityEnabled");

export const snsDetailsGewe = createGeweAccountMethod<{
  snsId: string;
}>("/gewe/v2/api/sns/snsDetails");

export const likeSnsGewe = createGeweAccountMethod<{
  snsId: string;
  operType: number;
  wxid: string;
}>("/gewe/v2/api/sns/likeSns");

export const contactsSnsListGewe = createGeweAccountMethod<{
  wxid: string;
  maxId?: string | number;
  decrypt?: boolean;
  firstPageMd5?: string;
}>("/gewe/v2/api/sns/contactsSnsList");

export const snsListGewe = createGeweAccountMethod<{
  maxId?: string | number;
  decrypt?: boolean;
  firstPageMd5?: string;
}>("/gewe/v2/api/sns/snsList");

export const snsVisibleScopeGewe = createGeweAccountMethod<{
  option: number;
}>("/gewe/v2/api/sns/snsVisibleScope");

export const snsSetPrivacyGewe = createGeweAccountMethod<{
  snsId: string;
  open: boolean;
}>("/gewe/v2/api/sns/snsSetPrivacy");

export const commentSnsGewe = createGeweAccountMethod<{
  snsId: string;
  operType: number;
  wxid: string;
  commentId?: string | number;
  content?: string;
}>("/gewe/v2/api/sns/commentSns");

export const forwardSnsGewe = createGeweAccountMethod<
  Pick<GeweSnsVisibilityParams, "allowWxIds" | "atWxIds" | "disableWxIds" | "privacy"> & {
    snsXml: string;
  }
>("/gewe/v2/api/sns/forwardSns");

export const geweMomentsApi = {
  uploadSnsImage: uploadSnsImageGewe,
  uploadSnsVideo: uploadSnsVideoGewe,
  downloadSnsVideo: downloadSnsVideoGewe,
  delSns: delSnsGewe,
  sendImgSns: sendImgSnsGewe,
  sendTextSns: sendTextSnsGewe,
  sendVideoSns: sendVideoSnsGewe,
  sendUrlSns: sendUrlSnsGewe,
  strangerVisibilityEnabled: strangerVisibilityEnabledGewe,
  snsDetails: snsDetailsGewe,
  likeSns: likeSnsGewe,
  contactsSnsList: contactsSnsListGewe,
  snsList: snsListGewe,
  snsVisibleScope: snsVisibleScopeGewe,
  snsSetPrivacy: snsSetPrivacyGewe,
  commentSns: commentSnsGewe,
  forwardSns: forwardSnsGewe,
};

export type GeweSnsList = GeweApiList;

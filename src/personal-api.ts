import { createGeweAccountMethod, type GeweApiObject } from "./gewe-account-api.js";

export type GeweProfile = {
  wxid: string;
  nickName?: string;
} & GeweApiObject;

export const updateProfileGewe = createGeweAccountMethod<{
  country: string;
  province: string;
  nickName: string;
  sex: number;
  signature: string;
  city?: string;
}>("/gewe/v2/api/personal/updateProfile");

export const updateHeadImgGewe = createGeweAccountMethod<{
  headImgUrl: string;
}>("/gewe/v2/api/personal/updateHeadImg");

export const getProfileGewe = createGeweAccountMethod<Record<string, never>, GeweProfile>(
  "/gewe/v2/api/personal/getProfile",
);

export const getQrCodeGewe = createGeweAccountMethod<Record<string, never>>(
  "/gewe/v2/api/personal/getQrCode",
);

export const getSafetyInfoGewe = createGeweAccountMethod<Record<string, never>>(
  "/gewe/v2/api/personal/getSafetyInfo",
);

export const privacySettingsGewe = createGeweAccountMethod<{
  open: boolean;
  option?: number;
}>("/gewe/v2/api/personal/privacySettings");

export const gewePersonalApi = {
  updateProfile: updateProfileGewe,
  updateHeadImg: updateHeadImgGewe,
  getProfile: getProfileGewe,
  getQrCode: getQrCodeGewe,
  getSafetyInfo: getSafetyInfoGewe,
  privacySettings: privacySettingsGewe,
};

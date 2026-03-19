import {
  createGeweAccountMethod,
  type GeweApiObject,
  type GeweApiList as GeweContactList,
} from "./gewe-account-api.js";

export type GeweContactsCatalog = {
  friends?: string[];
  chatrooms?: string[];
  ghs?: string[];
} & GeweApiObject;

export type GeweContactProfile = {
  userName?: string | null;
  wxid?: string | null;
  nickName?: string | null;
  remark?: string | null;
  alias?: string | null;
  [key: string]: unknown;
};

export const uploadPhoneAddressListGewe = createGeweAccountMethod<{
  phones: string[];
  opType: number;
}>("/gewe/v2/api/contacts/uploadPhoneAddressList");

export const deleteFriendGewe = createGeweAccountMethod<{
  wxid: string;
}>("/gewe/v2/api/contacts/deleteFriend");

export const syncImContactsGewe =
  createGeweAccountMethod<Record<string, never>, GeweContactList>("/gewe/v2/api/im/sync");

export const searchImContactGewe = createGeweAccountMethod<{
  scene: number;
  content: string;
}>("/gewe/v2/api/im/search");

export const searchContactGewe = createGeweAccountMethod<{
  contactsInfo: string;
}>("/gewe/v2/api/contacts/search");

export const checkRelationGewe = createGeweAccountMethod<{
  wxids: string[];
}>("/gewe/v2/api/contacts/checkRelation");

export const addImContactGewe = createGeweAccountMethod<{
  v3: string;
  v4: string;
}>("/gewe/v2/api/im/add");

export const addContactsGewe = createGeweAccountMethod<{
  scene: number;
  option: number;
  v3: string;
  v4: string;
  content: string;
}>("/gewe/v2/api/contacts/addContacts");

export const getImContactDetailGewe = createGeweAccountMethod<{
  toUserName: string;
}>("/gewe/v2/api/im/detail");

export const getPhoneAddressListGewe = createGeweAccountMethod<{
  phones?: string[];
}>("/gewe/v2/api/contacts/getPhoneAddressList");

export const getBriefInfoGewe = createGeweAccountMethod<{
  wxids: string[];
}, GeweContactProfile[]>("/gewe/v2/api/contacts/getBriefInfo");

export const getDetailInfoGewe = createGeweAccountMethod<{
  wxids: string[];
}, GeweContactProfile[]>("/gewe/v2/api/contacts/getDetailInfo");

export const fetchContactsListGewe =
  createGeweAccountMethod<Record<string, never>, GeweContactsCatalog>(
    "/gewe/v2/api/contacts/fetchContactsList",
  );

export const fetchContactsListCacheGewe =
  createGeweAccountMethod<Record<string, never>, GeweContactsCatalog>(
    "/gewe/v2/api/contacts/fetchContactsListCache",
  );

export const setFriendPermissionsGewe = createGeweAccountMethod<{
  wxid: string;
  onlyChat: boolean;
}>("/gewe/v2/api/contacts/setFriendPermissions");

export const setFriendRemarkGewe = createGeweAccountMethod<{
  wxid: string;
  remark: string;
}>("/gewe/v2/api/contacts/setFriendRemark");

export const geweContactsApi = {
  uploadPhoneAddressList: uploadPhoneAddressListGewe,
  deleteFriend: deleteFriendGewe,
  syncImContacts: syncImContactsGewe,
  searchImContact: searchImContactGewe,
  searchContact: searchContactGewe,
  checkRelation: checkRelationGewe,
  addImContact: addImContactGewe,
  addContacts: addContactsGewe,
  getImContactDetail: getImContactDetailGewe,
  getPhoneAddressList: getPhoneAddressListGewe,
  getBriefInfo: getBriefInfoGewe,
  getDetailInfo: getDetailInfoGewe,
  fetchContactsList: fetchContactsListGewe,
  fetchContactsListCache: fetchContactsListCacheGewe,
  setFriendPermissions: setFriendPermissionsGewe,
  setFriendRemark: setFriendRemarkGewe,
};

# GeWe API 补全与可用性审计

日期：2026-03-19

## 范围

本次审计覆盖两部分：

1. 对照 `/Users/wangnov/gewe-rs/docs/GeweAPI-Official/`，补全以下四个模块的官方 API wrapper：
   - 联系人模块
   - 群模块
   - 朋友圈模块
   - 个人资料模块
2. 从用户易用性、以及 OpenClaw Agent 与本插件的配合度两条线，检查这些能力现在是否“容易理解、容易发现、容易调用”。

## 本次补全结果

- 联系人模块：16 个端点，已补齐到 [`src/contacts-api.ts`](/Users/wangnov/gewe-openclaw/src/contacts-api.ts)
- 群模块：22 个端点，已补齐到 [`src/groups-api.ts`](/Users/wangnov/gewe-openclaw/src/groups-api.ts)
- 朋友圈模块：17 个端点，已补齐到 [`src/moments-api.ts`](/Users/wangnov/gewe-openclaw/src/moments-api.ts)
- 个人资料模块：6 个端点，已补齐到 [`src/personal-api.ts`](/Users/wangnov/gewe-openclaw/src/personal-api.ts)
- 共享账号请求封装：[`src/gewe-account-api.ts`](/Users/wangnov/gewe-openclaw/src/gewe-account-api.ts)
- 既有重复调用已收口到新模块：[`src/group-binding.ts`](/Users/wangnov/gewe-openclaw/src/group-binding.ts)

对应单元测试：

- [`src/contacts-api.test.ts`](/Users/wangnov/gewe-openclaw/src/contacts-api.test.ts)
- [`src/groups-api.test.ts`](/Users/wangnov/gewe-openclaw/src/groups-api.test.ts)
- [`src/moments-api.test.ts`](/Users/wangnov/gewe-openclaw/src/moments-api.test.ts)
- [`src/personal-api.test.ts`](/Users/wangnov/gewe-openclaw/src/personal-api.test.ts)

## 实机测试矩阵

### 联系人模块

已实机验证：

- `fetchContactsListCache`
  - 请求成功，但当前账号返回空数据
- `fetchContactsList`
  - 请求成功，返回结构包含 `friends / chatrooms / ghs`
- `getBriefInfo`
  - 请求成功
- `getDetailInfo`
  - 请求成功

未自动实机验证：

- `uploadPhoneAddressList`
- `deleteFriend`
- `syncImContacts`
- `searchImContact`
- `searchContact`
- `checkRelation`
- `addImContact`
- `addContacts`
- `getImContactDetail`
- `getPhoneAddressList`
- `setFriendPermissions`
- `setFriendRemark`

说明：
- 未测项要么是写接口，要么需要更明确的目标数据，否则有误操作风险。

### 群模块

已实机验证：

- `getChatroomInfo`
  - 请求成功

实机失败：

- `getChatroomAnnouncement`
  - 当前群返回 `500 获取群公告失败`
- `getChatroomMemberList`
  - 当前群返回 `500 获取群成员列表异常:null`
- `getChatroomQrCode`
  - 当前群返回 `500 获取群二维码失败`

跳过：

- `getChatroomMemberDetail`
  - 因当前 `getChatroomInfo` 未返回可用成员 seed，未继续自动调用

未自动实机验证：

- `modifyChatroomNickNameForSelf`
- `modifyChatroomName`
- `modifyChatroomRemark`
- `createChatroom`
- `removeMember`
- `agreeJoinRoom`
- `joinRoomUsingQRCode`
- `addGroupMemberAsFriend`
- `roomAccessApplyCheckApprove`
- `adminOperate`
- `saveContractList`
- `pinChat`
- `disbandChatroom`
- `setMsgSilence`
- `setChatroomAnnouncement`
- `quitChatroom`
- `inviteMember`

说明：
- 群模块的大多数未测项属于写接口，不适合在真实账号上无提示自动执行。

### 朋友圈模块

已实机验证：

- `snsList`
  - 请求成功，当前账号返回 10 条记录
- `contactsSnsList`
  - 对当前账号自己的 `wxid` 调用成功，返回 0 条

实机失败：

- `snsDetails`
  - 取 `snsList` 首条动态的 `id` 调用，返回 `500 朋友圈详情失败`

未自动实机验证：

- `uploadSnsImage`
- `uploadSnsVideo`
- `downloadSnsVideo`
- `delSns`
- `sendImgSns`
- `sendTextSns`
- `sendVideoSns`
- `sendUrlSns`
- `strangerVisibilityEnabled`
- `likeSns`
- `snsVisibleScope`
- `snsSetPrivacy`
- `commentSns`
- `forwardSns`

说明：
- 朋友圈模块写接口很多，且影响真实账号内容与可见范围，默认不做自动写测。

### 个人资料模块

已实机验证：

- `getProfile`
  - 请求成功
- `getQrCode`
  - 请求成功
- `getSafetyInfo`
  - 请求成功

未自动实机验证：

- `updateProfile`
- `updateHeadImg`
- `privacySettings`

说明：
- 三个未测项都会真实改资料或隐私设置，不适合在睡眠中的用户账号上自动写测。

## 审计发现

### P1：新增官方 API 现在是“代码层能力”，还不是 Agent 可发现、可直接调用的能力

证据：

- 插件目前只注册了两个管理工具：[`index.ts#L41`](/Users/wangnov/gewe-openclaw/index.ts#L41)、[`index.ts#L44`](/Users/wangnov/gewe-openclaw/index.ts#L44)
- 新增的联系人、群、朋友圈、个人资料 API 模块目前只是内部 wrapper，没有对应 tool surface：
  - [`src/contacts-api.ts`](/Users/wangnov/gewe-openclaw/src/contacts-api.ts)
  - [`src/groups-api.ts`](/Users/wangnov/gewe-openclaw/src/groups-api.ts)
  - [`src/moments-api.ts`](/Users/wangnov/gewe-openclaw/src/moments-api.ts)
  - [`src/personal-api.ts`](/Users/wangnov/gewe-openclaw/src/personal-api.ts)

影响：

- 用户和 agent 目前无法像调用 `gewe_sync_group_binding` 一样直接调用这些新补齐的官方能力
- 从 OpenClaw 的角度看，这批能力已经“存在于插件代码里”，但还没有进入“可发现、可调度、可解释”的层

建议：

- 下一步至少补一个受控的 agent-facing tool surface
- 最小方案是按模块提供 4 个 owner-only 管理工具
- 如果不想一次暴露太多写接口，也至少先把只读 API 暴露出来

### P1：目录能力仍然没有接上新补齐的联系人 API，用户和 agent 看到的仍常常是裸 `wxid`

证据：

- 当前目录能力只会实时调用 `getProfile` 和 `getChatroomInfo`：
  - [`src/channel-directory.ts#L218`](/Users/wangnov/gewe-openclaw/src/channel-directory.ts#L218)
  - [`src/channel-directory.ts#L242`](/Users/wangnov/gewe-openclaw/src/channel-directory.ts#L242)
- 它不会利用已经补齐的 `fetchContactsList / getBriefInfo / getDetailInfo`

影响：

- 用户在 allowlist、directory、status、工具结果里仍然更容易看到原始 `wxid`
- Agent 想“理解这个联系人是谁”时，仍然需要靠缓存、群成员、历史消息推断

建议：

- 用 `fetchContactsList` 做基础联系人底表
- 用 `getBriefInfo` / `getDetailInfo` 做按需 enrich
- 把联系人别名、备注、头像等数据接到 directory 与 name resolution

### P2：文档和 onboarding 还没有把这批新 API 能力讲出来，用户不知道“现在已经能做了什么”

证据：

- README 和配置文档目前只覆盖既有能力，没有提到这四个新模块 API 的可用范围
- 在 README / 配置文档里搜索不到这些新增 API 模块的说明

影响：

- 即使内部代码已经补齐，用户仍然很难形成正确心智模型
- Agent 也缺少一个稳定、清晰的“插件能力边界”说明

建议：

- README 增加“高级 API 能力”章节
- 文档里明确区分：
  - 已有 agent-facing 能力
  - 已补齐但暂未暴露为工具的内部能力
  - 已实机验证 / 未实机验证范围

### P2：官方文档与真实 GeWe 行为之间存在明显落差，插件目前还没有为这些差异提供更友好的解释层

证据：

- `fetchContactsListCache` 当前账号返回空
- `getChatroomAnnouncement / getChatroomMemberList / getChatroomQrCode / snsDetails` 在实机上返回 500

影响：

- 从用户角度看，会误以为“插件调用错了”
- 从 agent 角度看，只能拿到一条通用异常字符串，难以区分：
  - 账号权限不够
  - 群状态不支持
  - GeWe 服务端数据异常
  - 文档与线上行为不一致

建议：

- 给这些官方 API wrapper 再包一层更友好的错误分类
- 在 operator 工具或日志里把常见失败原因翻译成更可行动的提示

### P3：新模块的返回类型仍偏宽泛，适合作为底层 wrapper，但还不够适合作为上层 agent 工具的稳定契约

证据：

- 新增模块里大部分返回值还是 `Record<string, unknown>` 或泛型对象

影响：

- 作为底层封装没问题
- 但如果后续直接暴露给 agent，schema 可解释性还不够

建议：

- 优先给只读接口补更明确的返回结构类型
- 先从 `fetchContactsList`、`getBriefInfo`、`getChatroomInfo`、`snsList`、`getSafetyInfo` 开始

## 总结

这次补齐把 GeWe 官方四大模块的底层 API 缺口基本补平了，代码层已经具备继续往上做工具、目录增强和运营能力的基础。

但从“用户真的能顺手用起来”以及“OpenClaw Agent 真能理解并调用”这两个标准看，当前项目还差最后一层：

- 把内部 wrapper 暴露成 agent-facing 能力
- 把联系人能力接入 directory / 名字解析
- 把真实线上异常整理成可理解、可排障的输出

换句话说，现在的 GeWe 插件已经有了更完整的“发动机”，但仪表盘和操作杆还没同步补齐。

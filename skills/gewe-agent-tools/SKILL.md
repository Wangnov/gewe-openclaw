---
name: gewe-agent-tools
description: Use when an agent needs to inspect or operate GeWe or WeChat contacts, groups, Moments, or the logged-in personal account through the bundled GeWe tools. Triggers include looking up a current DM contact, checking a current group, managing group members, reading or posting Moments, or inspecting the current account profile and QR code.
metadata:
  {
    "openclaw":
      {
        "emoji": "🟢",
        "skillKey": "gewe-agent-tools",
        "requires": { "config": ["channels.gewe-openclaw"] },
      },
  }
---

# GeWe Agent Tools

优先把这四个工具当成 GeWe 的正式操作面：

- `gewe_contacts`
- `gewe_groups`
- `gewe_moments`
- `gewe_personal`

## 什么时候用哪个

- 处理联系人、好友、企业微信联系人、手机号通讯录：用 `gewe_contacts`
- 处理群资料、群成员、群公告、群管理：用 `gewe_groups`
- 处理朋友圈浏览、点赞、评论、发布、转发：用 `gewe_moments`
- 处理当前登录微信自己的资料、二维码、安全信息、隐私设置：用 `gewe_personal`

如果只是想知道“现在这个私聊对象是谁”，优先用 `gewe_contacts`。
如果只是想知道“现在这个群是谁、有哪些成员”，优先用 `gewe_groups`。

## 当前会话推断

有些 action 可以少填参数，优先利用当前会话：

- 在当前私聊会话里，`gewe_contacts` 的 `brief`、`detail`、`check_relation`，以及部分单人 action，可以从当前私聊会话推断 `wxid`
- 在当前群会话里，`gewe_groups` 的 `info`、`announcement`、`members`、`member_detail`、`qr_code`，以及多数群管理 action，可以从当前群会话推断 `groupId`
- 如果当前上下文不是对应会话，或者要操作的不是当前对象，就显式传 `wxid`、`wxids`、`groupId`

实用原则：

- 当前私聊里查对方资料：先试 `gewe_contacts` + `action: "brief"`，通常不用再填 `wxids`
- 当前群里查群信息：先试 `gewe_groups` + `action: "info"`，通常不用再填 `groupId`

## 推荐顺序

先读后写，先确认对象再执行变更。

推荐顺序：

1. 先用只读 action 确认目标对象
2. 再决定是否执行写操作
3. 写操作完成后，再用只读 action 复查结果

常见只读 action：

- `gewe_contacts`: `list` `list_cache` `brief` `detail` `search` `search_im` `im_detail` `check_relation` `phones_get`
- `gewe_groups`: `info` `announcement` `members` `member_detail` `qr_code`
- `gewe_moments`: `list_self` `list_contact` `detail` `download_video`
- `gewe_personal`: `profile` `qrcode` `safety_info`

## 写操作要谨慎

下面这些 action 会改真实微信状态。除非用户明确要求，否则不要主动调用：

- `gewe_contacts`: `set_remark` `set_only_chat` `delete` `add` `add_im` `phones_upload`
- `gewe_groups`: `set_self_nickname` `rename` `set_remark` `create` `remove_members` `agree_join` `join_via_qr` `add_member_as_friend` `approve_join_request` `admin_operate` `save_to_contacts` `pin` `disband` `set_silence` `set_announcement` `quit` `invite`
- `gewe_moments`: `upload_image` `upload_video` `delete` `post_text` `post_image` `post_video` `post_link` `set_stranger_visibility` `set_visible_scope` `set_privacy` `like` `comment` `forward`
- `gewe_personal`: `update_profile` `update_avatar` `privacy`

看到“加好友、删好友、拉群、退群、改备注、发朋友圈、改隐私、改资料”这类动作时，要默认它们会改真实账号状态。

## 常用调用套路

查看当前私聊对象：

- `gewe_contacts` with `action: "brief"`

查看当前群：

- `gewe_groups` with `action: "info"`

查看当前群成员：

- `gewe_groups` with `action: "members"`

查看某个联系人朋友圈：

- `gewe_moments` with `action: "list_contact"` and explicit `wxid`

查看自己账号资料：

- `gewe_personal` with `action: "profile"`

查看自己二维码：

- `gewe_personal` with `action: "qrcode"`

## 参数习惯

- 多联系人优先传 `wxids`
- 单联系人优先传 `wxid`
- 群优先传 `groupId`
- 要切账号时传 `accountId`
- 工具返回里会带 `input`，可以用来确认本次实际命中的目标

## 失败时怎么想

- 报“requires wxid/wxids/groupId”时，通常是因为当前会话不足以推断目标，需要显式补参数
- 报账号未配置时，优先检查 `accountId` 是否正确，以及该账号是否配置了 `token` 和 `appId`
- 如果只是想查名字，不要直接上写操作，先用 `brief`、`detail`、`info`、`members` 这类只读 action

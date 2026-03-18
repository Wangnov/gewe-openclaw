# GeWe OpenClaw Plugin

基于 GeWe API + Webhook 回调的 OpenClaw 微信通道插件。

## 安装

### 从 npm 安装

```bash
openclaw plugins install gewe-openclaw
```

### 从本地目录安装

```bash
openclaw plugins install /path/to/gewe-openclaw
```

或使用软链接（便于开发调试）：

```bash
openclaw plugins install --link /path/to/gewe-openclaw
```

### 从归档安装

OpenClaw 支持本地 `.zip` / `.tgz` / `.tar.gz` / `.tar` 归档：

```bash
openclaw plugins install ./gewe-openclaw.tgz
```

> 安装或启用插件后需要重启 Gateway。

## 配置方式（二选一）

安装完成后可任选一种方式完成配置：

### 方式 A：Onboarding 向导

```bash
openclaw onboard
```

在通道列表中选择 **GeWe**，按提示填写 `token`、`appId`、`webhook`，以及可选的 `mediaPublicUrl`/`S3` 媒体配置。

### 方式 B：直接编辑配置文件

直接编辑 `~/.openclaw/openclaw.json` 的 `channels.gewe-openclaw` 段落（见下方示例）。

完整配置手册见：[docs/openclaw-json-config.md](docs/openclaw-json-config.md)

## 配置

插件配置放在 `~/.openclaw/openclaw.json` 的 `channels.gewe-openclaw`，并确保通道开启（示例仅保留必填/常用字段）：

```json5
{
  "channels": {
    "gewe-openclaw": {
      "enabled": true,
      "token": "<gewe-token>",
      "appId": "<gewe-app-id>",
      "webhookHost": "0.0.0.0",
      "webhookPort": 4399,
      "webhookPath": "/webhook",
      "mediaHost": "0.0.0.0",
      "mediaPort": 4400,
      "mediaPath": "/gewe-media",
      "mediaPublicUrl": "https://your-public-domain/gewe-media",
      "s3Enabled": true,
      "s3Endpoint": "https://s3.amazonaws.com",
      "s3Region": "us-east-1",
      "s3Bucket": "your-bucket",
      "s3AccessKeyId": "<access-key-id>",
      "s3SecretAccessKey": "<secret-access-key>",
      "s3UrlMode": "public",
      "s3PublicBaseUrl": "https://cdn.example.com/gewe-media",
      "s3KeyPrefix": "gewe-openclaw/outbound",
      "allowFrom": ["wxid_xxx"]
    }
  }
}
```

完整参数说明：
- `webhookHost/webhookPort/webhookPath`：GeWe 回调入口（需公网可达，常配合 FRP）。
- `mediaPath`：本地媒体服务的路由前缀（默认 `/gewe-media`）。
- `mediaPublicUrl`：本地反代回退时的公网地址前缀（可选）。配置后会自动拼接媒体 ID；通常应与 `mediaPath` 对齐。
- `s3Enabled`：是否启用 S3 兼容上传。
- `s3Endpoint/s3Region/s3Bucket/s3AccessKeyId/s3SecretAccessKey`：S3 兼容服务连接参数。
- `s3SessionToken`：临时凭证可选字段。
- `s3ForcePathStyle`：是否启用 path-style（部分 S3 兼容服务需要）。
- `s3UrlMode`：`public` 或 `presigned`（默认 `public`）。
- `s3PublicBaseUrl`：`public` 模式下用于拼接可访问 URL（必填）。
- `s3PresignExpiresSec`：`presigned` 模式签名有效期（默认 3600 秒）。
- `s3KeyPrefix`：对象 key 前缀（默认 `gewe-openclaw/outbound`）。
- `allowFrom`：允许私聊触发的微信 ID（或在群里走 allowlist 规则）。
- `voiceAutoConvert`：自动将音频转为 silk（默认开启；设为 `false` 可关闭）。
- `silkAutoDownload`：自动下载 `rust-silk`（默认开启；可关闭后自行配置 `voiceSilkPath` / `voiceDecodePath`）。
- `silkVersion`：自动下载的 `rust-silk` 版本（`latest` 会自动清理旧版本）。
- `silkBaseUrl`：自定义下载源（默认 GitHub Releases）。
- `silkInstallDir`：自定义安装目录（默认 `~/.openclaw/tools/rust-silk/<version>`）。
- `silkAllowUnverified`：校验文件缺失时是否允许继续（默认 `false`）。
- `silkSha256`：手动指定下载包 SHA256（用于私有源或校验文件缺失场景）。
 - `apiBaseUrl`：GeWe API 地址（默认 `https://www.geweapi.com`）。
 - `voiceFfmpegPath`/`videoFfmpegPath`/`videoFfprobePath`：自定义 ffmpeg/ffprobe 路径。
 - `voiceSilkPath`/`voiceSilkArgs`：自定义 silk 编码器路径和参数（不使用自动下载时）。
 - `voiceSilkPipe`：是否启用 ffmpeg+rust-silk 的 stdin/stdout 管道（默认关闭；失败会回退到临时文件）。
   - 低频/非高并发且磁盘压力不高时，推荐临时文件方案（更稳定/更快）。
   - 高频/多并发或磁盘压力大时，推荐 pipe 方案（减少磁盘 IO）。
- `voiceDecodePath`/`voiceDecodeArgs`/`voiceDecodeOutput`：自定义 silk 解码器（入站语音转写用）。
- `mediaMaxMb`：上传媒体大小上限（默认 20MB）。
- `downloadMinDelayMs`/`downloadMaxDelayMs`：入站媒体下载节流。
- `autoQuoteReply`：是否开启 `replyToId + 纯文本` 自动引用回复（默认开启；设为 `false` 可关闭）。

## 群聊/私聊触发与回复规则

`groups` 和 `dms` 都支持 `*` 默认项 + 精确项覆写：

- `groups["*"]` / `groups["<roomId>@chatroom"]`
- `dms["*"]` / `dms["<wxid>"]`

局部规则可继续搭配既有字段一起使用，例如 `allowFrom`、`skills`、`systemPrompt`、`tools`（仅群聊）。

### 群聊触发

`groups[*].trigger.mode` 支持：

- `at`：只有被 `@` 时触发
- `quote`：只有引用机器人消息时触发
- `at_or_quote`：`@` 或引用机器人消息都触发
- `any_message`：任何消息都触发

群聊默认值是 `at`。

### 群聊回复

`groups[*].reply.mode` 支持：

- `plain`：普通回复
- `quote_source`：首条回复自动引用当前入站消息
- `at_sender`：首条文本回复自动 `@` 发送者
- `quote_and_at`：首条文本回复同时引用并 `@`；非文本回复会自动退化为 `quote_source`

群聊默认值会跟随 `autoQuoteReply`：

- 未配置或为 `true`：默认 `quote_source`
- 显式设为 `false`：默认 `plain`

### 私聊触发与回复

`dms[*].trigger.mode` 支持：

- `any_message`
- `quote`

`dms[*].reply.mode` 支持：

- `plain`
- `quote_source`

私聊默认触发是 `any_message`。私聊默认回复也会跟随 `autoQuoteReply` 回退到 `quote_source` 或 `plain`。

### 兼容旧配置

- `requireMention: true/false` 仍然可用，会分别映射到群聊 `trigger.mode = "at"` / `"any_message"`
- 新的 `trigger` / `reply` 配置优先级更高
- `autoQuoteReply` 现在主要用于“未显式配置 `reply.mode` 时”的默认值回退

示例：

```json5
{
  "channels": {
    "gewe-openclaw": {
      "groupPolicy": "open",
      "groups": {
        "*": {
          "trigger": { "mode": "at" },
          "reply": { "mode": "quote_source" }
        },
        "project-room@chatroom": {
          "trigger": { "mode": "at_or_quote" },
          "reply": { "mode": "quote_and_at" },
          "skills": ["project-skill"]
        },
        "ops-room@chatroom": {
          "trigger": { "mode": "any_message" },
          "reply": { "mode": "plain" }
        }
      },
      "dms": {
        "*": {
          "reply": { "mode": "quote_source" }
        },
        "wxid_special": {
          "trigger": { "mode": "quote" },
          "systemPrompt": "Only handle quoted follow-ups."
        }
      }
    }
  }
}
```

## 目录、Allowlist 与状态

GeWe 现在补齐了目录、标准 allowlist 适配和状态摘要。

### 目录

目录会混合这些来源：

- `allowFrom`、`groupAllowFrom`、`dms`、`groups`
- 顶层 `bindings[]` 里命中的 GeWe 群
- 运行中见过的私聊对象、群、群成员

支持的目录能力：

- `self`：查看当前账号自己的 `wxid` 和昵称
- `listPeers`：查看已知私聊对象
- `listGroups`：查看已知群
- `listGroupMembers`：按需读取某个群的实时成员列表

其中 `listGroupMembers` 会 live 调用 GeWe 的 `getChatroomInfo`，结果也会反哺后续名字解析。

### Allowlist

标准 `/allowlist` 入口负责顶层两类名单：

- 私聊：`allowFrom`
- 群发言人：`groupAllowFrom`

如果你要管理“某一个群自己的 `groups.<groupId>.allowFrom` 覆盖”，请用插件工具：

- `gewe_manage_group_allowlist`

它支持：

- `inspect`
- `add`
- `remove`
- `replace`
- `clear`

示例：

```json5
{
  "mode": "replace",
  "groupId": "ops-room@chatroom",
  "entries": ["wxid_admin_1", "wxid_admin_2"]
}
```

如果你就在目标群里调用，`groupId` 可以省略；工具会自动用当前群。

### 状态

GeWe 的状态页现在会额外显示：

- API 是否可达、探测延迟
- 当前账号自己的 `wxid` / 昵称
- 已知私聊对象数、已知群数、已缓存群成员数
- 显式 `bindings[]` 数量
- 群局部 allowlist 覆盖数量
- pairing 本地 allow-from 数量

## 把群绑定到 Agent / ACP

除了 `channels.gewe-openclaw` 这一段插件配置，GeWe 还支持配合 OpenClaw 顶层 `bindings[]` 使用。

可以把它理解成两层：

- 顶层 `bindings[]` 决定“这个群/私聊归哪个 agent，或者归哪个 ACP 持久会话”
- `groups.<groupId>.bindingIdentity` 决定“绑定以后，机器人在这个群里显示成什么身份”

### 绑定到普通 Agent

下面这个例子表示：`ops-room@chatroom` 这个群固定交给 `ops` agent 处理。

```json5
{
  "bindings": [
    {
      "type": "route",
      "agentId": "ops",
      "match": {
        "channel": "gewe-openclaw",
        "accountId": "work",
        "peer": {
          "kind": "group",
          "id": "ops-room@chatroom"
        }
      }
    }
  ],
  "channels": {
    "gewe-openclaw": {
      "accounts": {
        "work": {
          "groups": {
            "ops-room@chatroom": {
              "trigger": { "mode": "at_or_quote" },
              "reply": { "mode": "quote_and_at" }
            }
          }
        }
      }
    }
  }
}
```

说明：

- `match.channel` 写 `gewe-openclaw`
- `match.accountId` 可写具体账号，也可以写 `"*"`
- 群聊 `peer.kind` 写 `"group"`，`peer.id` 直接写 `群ID@chatroom`
- `bindings[]` 用于描述群或私聊与 agent 的绑定关系

### 绑定到 ACP 持久会话

下面这个例子表示：这个群固定进入 `codex` agent 的一个 ACP 持久会话。

```json5
{
  "bindings": [
    {
      "type": "acp",
      "agentId": "codex",
      "match": {
        "channel": "gewe-openclaw",
        "accountId": "work",
        "peer": {
          "kind": "group",
          "id": "repo-room@chatroom"
        }
      },
      "acp": {
        "label": "repo-room",
        "mode": "persistent",
        "cwd": "/workspace/repo-a",
        "backend": "acpx"
      }
    }
  ]
}
```

说明：

- GeWe 群没有 Telegram topic / Feishu thread 这种层级，所以 ACP 绑定语义是“整群共享一个 ACP 会话”
- 同一个群只配置一种绑定方式，不要同时配置普通 route binding 和 ACP binding

### 群里的绑定身份

`groups.<groupId>.bindingIdentity` 用来描述“这个群已经绑定到 agent 后，机器人在群里应该显示成什么样”。

当前只同步两项：

- 机器人自己的群昵称 `selfNickname`
- 这个群在机器人侧的备注 `remark`

不会改群名。

```json5
{
  "channels": {
    "gewe-openclaw": {
      "groups": {
        "*": {
          "bindingIdentity": {
            "enabled": true,
            "selfNickname": { "source": "agent_name" },
            "remark": { "source": "agent_id" }
          }
        },
        "repo-room@chatroom": {
          "bindingIdentity": {
            "remark": { "source": "name_and_id" }
          }
        }
      }
    }
  }
}
```

默认值：

- `enabled = true`
- `selfNickname.source = "agent_name"`
- `remark.source = "agent_id"`

可选值：

- `selfNickname.source`: `agent_name | agent_id | literal`
- `remark.source`: `agent_id | agent_name | name_and_id | literal`

当 `source = "literal"` 时，需要额外提供 `value`。

### 手动同步群绑定身份

插件提供了一个仅 owner 可用的工具：`gewe_sync_group_binding`。

它不会在启动时自动改微信群信息，而是采用手动同步流程：

1. 先配置顶层 `bindings[]`
2. 再按需配置 `groups.<groupId>.bindingIdentity`
3. 最后由 owner 调用 `gewe_sync_group_binding`

工具参数：

```json5
{
  "mode": "inspect", // inspect | dry_run | apply
  "groupId": "repo-room@chatroom", // 可选；在当前绑定群里可自动推断
  "accountId": "work",             // 可选；默认当前账号
  "syncSelfNickname": true,
  "syncRemark": true
}
```

三个模式的区别：

- `inspect`：查看当前值、期望值、会改哪些字段
- `dry_run`：和 `inspect` 类似，但明确用于“准备执行前预演”
- `apply`：只在字段真的发生变化时调用 GeWe API

使用限制：

- 只接受“有显式 binding 的群”，不会对仅靠默认 main route 命中的群做推断同步
- `bindingIdentity.enabled = false` 的群不能执行同步
- 在非群上下文里调用时，必须显式传 `groupId`

发送媒体时的 URL 策略：
- 本地文件：优先上传 S3，失败回退 `mediaPublicUrl` 本地反代。
- 公网 URL：先尝试原 URL 发送，失败后再尝试上传 S3，仍失败回退本地反代。

## 富消息与消息复用

除了直接构造 `channelData["gewe-openclaw"]`，现在也可以通过共享 `message` 工具走标准动作：

- `send`
- `reply`
- `unsend`

并在参数里附带一个 `gewe` 对象来表达微信专属语义。

示例：在当前群里回复并做部分引用

```json5
{
  "action": "reply",
  "message": "收到，我接着处理",
  "gewe": {
    "quote": {
      "partialText": "需要继续跟进的那一段"
    }
  }
}
```

示例：撤回一条已经发出的消息

```json5
{
  "action": "unsend",
  "to": "ops-room@chatroom",
  "messageId": "10001",
  "newMessageId": "10002",
  "createTime": "1710000002"
}
```

插件支持通过 `channelData["gewe-openclaw"]` 传入 GeWe 专有消息语义。结构如下：

- `appMsg: { appmsg }`：直接发送 `<appmsg>` XML。
- `quoteReply: { svrid?, title?, atWxid? }`：发送引用回复；未提供 `svrid` 时会回退到宿主 `replyToId`。
- `emoji: { emojiMd5, emojiSize }`：发送表情。
- `nameCard: { nickName, nameCardWxid }`：发送名片。
- `miniApp: { miniAppId, displayName, pagePath, coverImgUrl, title, userName }`：发送小程序。
- `revoke: { msgId, newMsgId, createTime }`：撤回指定消息。
- `forward: { kind, xml, coverImgUrl? }`：复用已存在消息 XML 进行二次转发。
  - `kind` 支持 `image | video | file | link | miniApp`
  - `miniApp` 转发额外需要 `coverImgUrl`

示例：

```json
{
  "channelData": {
    "gewe-openclaw": {
      "forward": {
        "kind": "link",
        "xml": "<msg>...</msg>"
      }
    }
  }
}
```

引用回复示例：

```json
{
  "channelData": {
    "gewe-openclaw": {
      "quoteReply": {
        "svrid": "208008054840614808",
        "title": "这条是引用回复",
        "atWxid": "wxid_member_optional"
      }
    }
  }
}
```

另外，普通文本回复如果带有宿主 `replyToId`，插件默认会自动映射为 GeWe 的引用回复气泡；媒体、链接、小程序、撤回、转发等既有富消息分支不会被这条自动桥接抢占。若不希望自动引用，可在配置里设置 `autoQuoteReply: false`。

如果希望让模型主动发“部分引用”，GeWe 通道会识别回复末尾的一行隐藏指令：

```text
[[GEWE_QUOTE_PARTIAL:要引用的原文片段]]
```

插件会在发送前剥离这行指令，并自动转成 `quoteReply.partialText`。通常配合宿主 `replyToId` 一起使用，用来引用当前正在回复的那条消息中的某一段文字。

入站 `appmsg` 现在会尽量保留复用素材，并在上下文中附带：

- `MsgType`：原始 GeWe `msgType`
- `GeWeXml`：原始 XML
- `GeWeAppMsgXml`：`appmsg` XML
- `GeWeAppMsgType`：`appmsg` 的 `type`
- `GeWeQuoteXml`：引用消息原始 XML（当 `type=57` 时）
- `GeWeQuoteTitle`：引用回复正文
- `GeWeQuoteType`：被引用消息类型
- `GeWeQuoteSvrid`：被引用消息 sid
- `GeWeQuoteFromUsr` / `GeWeQuoteChatUsr` / `GeWeQuoteDisplayName`
- `GeWeQuoteContent` / `GeWeQuoteMsgSource`

这意味着收到链接、文件通知、引用消息或其他未专门解析的 `appmsg` 后，可以直接取上下文里的 XML 和引用元数据，再走 `forward` / `appMsg` / `quoteReply` 能力完成复用或继续回复。

> 配置变更后需重启 Gateway。

## 高级用法：让未安装插件也出现在 onboarding 列表

默认情况下，**只有已安装的插件**会出现在 onboarding 列表中。  
如果你希望“未安装时也能在列表中展示”，需要配置本地 catalog：

```
~/.openclaw/plugins/catalog.json
```

示例（添加一次即可）：

```json
{
  "entries": [
    {
      "name": "gewe-openclaw",
      "openclaw": {
        "channel": {
          "id": "gewe-openclaw",
          "label": "GeWe",
          "selectionLabel": "WeChat (GeWe)",
          "detailLabel": "WeChat (GeWe)",
          "docsPath": "/channels/gewe-openclaw",
          "docsLabel": "gewe-openclaw",
          "blurb": "WeChat channel via GeWe API and webhook callbacks.",
          "aliases": ["gewe-openclaw", "gewe", "wechat", "wx"],
          "order": 72,
          "quickstartAllowFrom": true
        },
        "install": {
          "npmSpec": "gewe-openclaw",
          "defaultChoice": "npm"
        }
      }
    }
  ]
}
```

> 现在插件已支持 onboarding：选择 GeWe 通道后会提示填写 token/appId/webhook/mediaPublicUrl 等配置。

## 依赖

### npm 依赖

- `zod`

### peer 依赖

- `openclaw` (>= 2026.1.29)

### 系统级工具

- `ffmpeg` / `ffprobe`（用于视频缩略图与时长）
- `rust-silk`（出站语音转 silk + 入站语音解码；支持自动下载）
- 或者自行安装 `silk-encoder` / `silk-decoder` 并在配置中指定路径

### 网络/服务依赖

- GeWe API 服务
- Webhook 回调需要公网可达（可配合 FRP）
- 媒体对外地址（`mediaPublicUrl`）

# GeWe `openclaw.json` 配置手册

这份文档专门说明本插件在 `~/.openclaw/openclaw.json` 里的全部配置项。

如果你只想先跑起来，先看“最小可用示例”；如果你要做多账号、群规则、私聊白名单、S3 媒体、语音转码、分群触发策略，请按下面各章节查阅。

## 1. 配置放哪里

本插件的配置根路径是：

```json5
{
  "channels": {
    "gewe-openclaw": {
      // 所有 GeWe 配置都放在这里
    }
  }
}
```

## 2. 先理解 5 个配置作用域

GeWe 的配置不是只有一层。为了便于管理，它分成 5 个作用域：

1. 顶层 `bindings[]`
   这是 OpenClaw 宿主的全局绑定表，不在 `channels.gewe-openclaw` 里面。
   它负责把某个 GeWe 群或私聊绑定到指定 agent，或者绑定到一个 ACP 持久会话。

2. `channels.gewe-openclaw`
   全局默认配置。默认账号、默认策略、默认 webhook、默认媒体配置都可以放这里。

3. `channels.gewe-openclaw.accounts.<accountId>`
   某个账号的覆盖配置。适合一机多微信号、多套 token/appId、多套群规则。

4. `groups.<groupId>`
   某个群聊的局部规则。适合“这个群要 `at` 才回复，那个群任何消息都回复”。

5. `dms.<wxid>`
   某个私聊对象的局部规则。适合“默认私聊都能聊，但某个人只有 quote 才触发”。

## 3. 合并与覆盖规则

理解这个插件，最重要的一点就是“顶层默认 + 账号覆盖 + 群/私聊局部覆盖”。

- 顶层 `bindings[]` 由 OpenClaw 宿主直接匹配，不参与 `channels.gewe-openclaw` 的继承合并。
- 顶层 `channels.gewe-openclaw` 会先作为默认值。
- `accounts.<accountId>` 会覆盖同名顶层字段。
- `groups` 和 `dms` 是“合并”的，不是整块替换。
- 同一个 `groups.<key>` / `dms.<key>` 下，账号级配置会覆盖顶层同名字段。
- `*` 是默认项，精确 ID 会覆盖 `*`。

### 合并示意

例如：

```json5
{
  "channels": {
    "gewe-openclaw": {
      "groups": {
        "*": {
          "reply": { "mode": "quote_source" }
        }
      },
      "accounts": {
        "work": {
          "groups": {
            "project@chatroom": {
              "trigger": { "mode": "at_or_quote" }
            }
          }
        }
      }
    }
  }
}
```

那么 `work` 账号里的 `project@chatroom` 最终效果是：

- 继承顶层 `reply.mode = "quote_source"`
- 再叠加账号级 `trigger.mode = "at_or_quote"`

## 4. 最小可用示例

这是最常见、最容易上手的配置：

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
      "allowFrom": ["wxid_yourself"]
    }
  }
}
```

这份配置的含义：

- 启用 GeWe 通道
- 使用 `token + appId` 连接 GeWe API
- 启动一个本地 webhook 服务接收入站消息
- 只允许 `wxid_yourself` 私聊触发

## 5. 推荐的安全起步配置

如果你希望“私聊可控、群聊默认谨慎”，推荐这样开始：

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
      "dmPolicy": "allowlist",
      "allowFrom": ["wxid_admin_1", "wxid_admin_2"],
      "groupPolicy": "allowlist",
      "groupAllowFrom": ["wxid_admin_1"],
      "groups": {
        "team-room@chatroom": {
          "trigger": { "mode": "at" },
          "reply": { "mode": "quote_source" }
        }
      }
    }
  }
}
```

这份配置表示：

- 只有 `allowFrom` 里的私聊对象能触发
- 只允许 `team-room@chatroom` 这个群进入
- 群里只有 `wxid_admin_1` 这个成员能真正触发
- 在允许的群里，默认要 `at` 才回复

## 6. 顶层字段总览

下面这些字段都可以出现在：

- `channels.gewe-openclaw`
- `channels.gewe-openclaw.accounts.<accountId>`

其中 `accounts.<accountId>` 不能再继续嵌套 `accounts`。

### 6.1 基础与账号字段

#### `enabled`

- 类型：`boolean`
- 作用：是否启用该 GeWe 配置作用域
- 常见位置：顶层、账号级

示例：

```json5
{
  "channels": {
    "gewe-openclaw": {
      "enabled": true
    }
  }
}
```

#### `name`

- 类型：`string`
- 作用：给账号起一个显示名称，便于多账号区分
- 常见位置：账号级

示例：

```json5
{
  "channels": {
    "gewe-openclaw": {
      "accounts": {
        "work": { "name": "工作微信" },
        "personal": { "name": "个人微信" }
      }
    }
  }
}
```

#### `apiBaseUrl`

- 类型：`string`
- 默认值：`https://www.geweapi.com`
- 作用：GeWe API 的基地址
- 什么时候改：你在使用私有部署、代理地址、镜像地址时

#### `token`

- 类型：`string`
- 作用：GeWe API token

#### `tokenFile`

- 类型：`string`
- 作用：从文件读取 token，而不是直接写在 `openclaw.json`
- 推荐：生产环境优先用 `tokenFile`，不要把密钥硬编码进配置文件

#### `appId`

- 类型：`string`
- 作用：GeWe 应用 ID

#### `appIdFile`

- 类型：`string`
- 作用：从文件读取 appId

### 6.2 `token` / `tokenFile` / 环境变量的优先级

默认账号的凭据优先级大致如下：

1. 环境变量 `GEWE_TOKEN` / `GEWE_APP_ID`
2. `tokenFile` / `appIdFile`
3. `token` / `appId`

如果你显式使用 `accounts.<accountId>` 配置命名账号，则该账号不会自动复用默认账号的环境变量，应该在账号级单独配置凭据。

## 7. Webhook 与媒体服务

### 7.1 Webhook 字段

#### `webhookHost`

- 类型：`string`
- 作用：Webhook 服务监听地址
- 常见值：`0.0.0.0`

#### `webhookPort`

- 类型：正整数
- 作用：Webhook 服务端口

#### `webhookPath`

- 类型：`string`
- 作用：Webhook 路径
- 常见值：`/webhook`

#### `webhookSecret`

- 类型：`string`
- 作用：Webhook 签名或校验用的密钥
- 什么时候配：当你的 GeWe 回调链路启用了额外校验时

#### `webhookPublicUrl`

- 类型：`string`
- 作用：Webhook 的公网地址
- 说明：通常用于某些部署/向导场景，真正监听仍由 `webhookHost/webhookPort/webhookPath` 决定

### 7.2 媒体服务字段

#### `mediaHost`

- 类型：`string`
- 作用：本地媒体服务监听地址

#### `mediaPort`

- 类型：正整数
- 作用：本地媒体服务端口

#### `mediaPath`

- 类型：`string`
- 作用：本地媒体服务路由前缀
- 常见值：`/gewe-media`

#### `mediaPublicUrl`

- 类型：`string`
- 作用：当插件需要把本地媒体暴露给外部访问时，使用这个公网前缀拼接最终 URL
- 适用场景：没有 S3，或 S3 上传失败时回退到本地反代

#### `mediaMaxMb`

- 类型：数字
- 默认值：`20`
- 作用：上传媒体大小上限，单位 MB

### 7.3 媒体 URL 的实际发送顺序

发送本地媒体时，插件大致会按这个顺序尝试：

1. 如果启用了 S3，优先上传 S3
2. 如果 S3 失败，回退到 `mediaPublicUrl`
3. 如果你传入的本来就是公网 URL，则先尝试直接发送原 URL

## 8. S3 兼容上传

如果你希望把本地媒体传到对象存储，再让 GeWe 使用公网 URL 访问，可以配置 S3。

### 8.1 S3 字段

#### `s3Enabled`

- 类型：`boolean`
- 作用：是否启用 S3 兼容上传

#### `s3Endpoint`

- 类型：`string`
- 作用：S3 服务地址，例如 AWS S3、Cloudflare R2、MinIO、自建兼容服务

#### `s3Region`

- 类型：`string`
- 作用：区域名

#### `s3Bucket`

- 类型：`string`
- 作用：桶名

#### `s3AccessKeyId`

- 类型：`string`
- 作用：访问密钥 ID

#### `s3SecretAccessKey`

- 类型：`string`
- 作用：访问密钥 Secret

#### `s3SessionToken`

- 类型：`string`
- 作用：临时凭证场景下可选

#### `s3ForcePathStyle`

- 类型：`boolean`
- 作用：是否强制 path-style URL
- 适用场景：某些兼容实现（如部分 MinIO/私有网关）

#### `s3UrlMode`

- 类型：`"public" | "presigned"`
- 默认值：`public`
- 作用：决定插件返回哪种对象 URL

#### `s3PublicBaseUrl`

- 类型：`string`
- 作用：当 `s3UrlMode = "public"` 时，用它来拼接对象访问地址
- 注意：如果 `s3Enabled = true` 且 `s3UrlMode = "public"`，这是必填项

#### `s3KeyPrefix`

- 类型：`string`
- 作用：对象 key 的前缀
- 常见值：`gewe-openclaw/outbound`

#### `s3PresignExpiresSec`

- 类型：正整数
- 作用：当 `s3UrlMode = "presigned"` 时，签名 URL 的有效期（秒）

### 8.2 S3 配置校验规则

当 `s3Enabled = true` 时，下面这些字段必须有值：

- `s3Endpoint`
- `s3Region`
- `s3Bucket`
- `s3AccessKeyId`
- `s3SecretAccessKey`

此外，如果 `s3UrlMode = "public"`，还必须配置：

- `s3PublicBaseUrl`

### 8.3 S3 示例

```json5
{
  "channels": {
    "gewe-openclaw": {
      "s3Enabled": true,
      "s3Endpoint": "https://<account>.r2.cloudflarestorage.com",
      "s3Region": "auto",
      "s3Bucket": "gewe-media",
      "s3AccessKeyId": "<key>",
      "s3SecretAccessKey": "<secret>",
      "s3UrlMode": "public",
      "s3PublicBaseUrl": "https://cdn.example.com/gewe-media",
      "s3KeyPrefix": "prod/gewe"
    }
  }
}
```

## 9. 语音、视频与转码相关字段

这部分字段主要影响：

- 出站语音是否自动转 silk
- 入站 silk 语音是否自动解码
- 视频处理时使用哪个 ffmpeg / ffprobe

### 9.1 语音发送与编码

#### `voiceAutoConvert`

- 类型：`boolean`
- 默认值：通常视为开启
- 作用：发送音频时，是否自动转成 GeWe 需要的 silk 语音格式

#### `voiceFfmpegPath`

- 类型：`string`
- 作用：自定义 `ffmpeg` 路径

#### `voiceSilkPath`

- 类型：`string`
- 作用：自定义 silk 编码器路径

#### `voiceSilkArgs`

- 类型：`string[]`
- 作用：自定义 silk 编码器参数模板

#### `voiceSilkPipe`

- 类型：`boolean`
- 默认值：关闭
- 作用：是否优先使用 stdin/stdout 管道方式做 ffmpeg + silk 编码
- 建议：
  - 稳定优先：关闭，走临时文件模式
  - 降低磁盘 IO：开启

#### `voiceSampleRate`

- 类型：正整数
- 作用：语音编码采样率

### 9.2 入站语音解码

#### `voiceDecodePath`

- 类型：`string`
- 作用：自定义 silk 解码器路径

#### `voiceDecodeArgs`

- 类型：`string[]`
- 作用：自定义解码参数模板

#### `voiceDecodeSampleRate`

- 类型：正整数
- 作用：入站语音解码后的采样率

#### `voiceDecodeOutput`

- 类型：`"pcm" | "wav"`
- 作用：解码输出格式

### 9.3 自动下载 rust-silk

#### `silkAutoDownload`

- 类型：`boolean`
- 作用：是否自动下载 `rust-silk`

#### `silkVersion`

- 类型：`string`
- 作用：自动下载的 `rust-silk` 版本
- 常见值：`latest`

#### `silkBaseUrl`

- 类型：`string`
- 作用：自定义下载源

#### `silkSha256`

- 类型：`string`
- 作用：手动指定下载包校验值

#### `silkAllowUnverified`

- 类型：`boolean`
- 作用：校验信息缺失时是否允许继续
- 不建议默认开启

#### `silkInstallDir`

- 类型：`string`
- 作用：自定义 `rust-silk` 安装目录

### 9.4 视频处理

#### `videoFfmpegPath`

- 类型：`string`
- 作用：自定义视频处理 `ffmpeg` 路径

#### `videoFfprobePath`

- 类型：`string`
- 作用：自定义 `ffprobe` 路径

#### `videoThumbUrl`

- 类型：`string`
- 作用：视频缩略图的默认 URL 或提示值

## 10. 安全与触发控制

这是最容易配错、也最值得认真理解的一部分。

### 10.1 `dmPolicy`

- 类型：`"pairing" | "allowlist" | "open" | "disabled"`
- 默认值：`pairing`
- 作用：控制私聊能不能触发

含义如下：

- `pairing`
  不在允许列表里的私聊用户默认不能触发，但可以通过配对码加入允许列表。

- `allowlist`
  只有 `allowFrom` 里的私聊对象可以触发。

- `open`
  允许任意私聊对象触发。
  注意：schema 会强制要求 `allowFrom` 里包含 `"*"`，这是插件为了避免误配做的显式确认。

- `disabled`
  完全关闭私聊触发。

### 10.2 `allowFrom`

- 类型：`string[]`
- 作用：私聊允许列表
- 常见值：`["wxid_xxx"]` 或 `["*"]`

建议：

- 如果是 `dmPolicy = "allowlist"`，这里写明确的 `wxid`
- 如果是 `dmPolicy = "open"`，这里写 `["*"]`

### 10.3 `groupPolicy`

- 类型：`"open" | "disabled" | "allowlist"`
- 默认值：`allowlist`
- 作用：控制群聊整体是否允许进入

含义如下：

- `open`
  任何群都可以进入下一层判断

- `allowlist`
  只有出现在 `groups` 里的群才允许进入

- `disabled`
  完全关闭群聊触发

注意：

- 如果你没有显式设置 `channels.gewe-openclaw.groupPolicy`，插件还会回退到 `channels.defaults.groupPolicy`
- 但推荐直接在本插件里写清楚，避免混淆

### 10.4 `groupAllowFrom`

- 类型：`string[]`
- 作用：群成员级别的允许列表
- 说明：它不是“允许哪些群”，而是“在群里，允许哪些成员触发”

常见用法：

```json5
{
  "groupPolicy": "allowlist",
  "groupAllowFrom": ["wxid_admin_1", "wxid_admin_2"]
}
```

表示：

- 群本身还要通过 `groups`
- 但就算进了允许群，也只有这两个成员说话时才会触发

## 11. `groups`：按群聊做局部配置

`groups` 是一个对象，key 建议直接使用群 ID，也就是 `xxx@chatroom`。

```json5
{
  "groups": {
    "*": {
      "trigger": { "mode": "at" }
    },
    "team-room@chatroom": {
      "reply": { "mode": "quote_and_at" }
    }
  }
}
```

### 11.1 `groups` key 怎么写

推荐只写：

- `*`
- `群ID@chatroom`

虽然内部有一定的匹配兼容逻辑，但实际运行时最稳妥的仍然是直接使用 GeWe/微信侧的群 ID。

### 11.2 `groups.<key>.enabled`

- 类型：`boolean`
- 作用：是否启用该群配置

常见用法：

```json5
{
  "groups": {
    "noisy-room@chatroom": {
      "enabled": false
    }
  }
}
```

### 11.3 `groups.<key>.allowFrom`

- 类型：`string[]`
- 作用：该群自己的成员允许列表
- 说明：如果配置了，它会在顶层 `groupAllowFrom` 之后再做一层更细的约束

### 11.4 `groups.<key>.skills`

- 类型：`string[]`
- 作用：给该群限制可用 skill 列表
- 说明：这是局部 replyOptions 透传

### 11.5 `groups.<key>.systemPrompt`

- 类型：`string`
- 作用：给该群追加局部系统提示词

### 11.6 `groups.<key>.tools`

- 类型：

```json5
{
  "allow": ["tool.a"],
  "alsoAllow": ["tool.b"],
  "deny": ["tool.c"]
}
```

- 作用：控制该群可使用的工具策略
- 注意：`allow` 和 `alsoAllow` 不能同时设置

### 11.7 `groups.<key>.trigger.mode`

- 类型：`"at" | "quote" | "at_or_quote" | "any_message"`
- 默认值：`at`

含义如下：

- `at`
  只有被 `@` 时触发

- `quote`
  只有“引用机器人自己的消息”时触发

- `at_or_quote`
  被 `@` 或引用机器人消息，任一成立就触发

- `any_message`
  该群任何消息都触发

### 11.8 `groups.<key>.reply.mode`

- 类型：`"plain" | "quote_source" | "at_sender" | "quote_and_at"`
- 默认值：
  - `autoQuoteReply !== false` 时默认 `quote_source`
  - `autoQuoteReply === false` 时默认 `plain`

含义如下：

- `plain`
  普通发送，不自动引用、不自动 `@`

- `quote_source`
  首条回复自动引用当前入站消息

- `at_sender`
  首条文本回复自动 `@` 发送者

- `quote_and_at`
  首条文本回复同时引用并 `@` 发送者；如果回复不是文本，会自动退化为 `quote_source`

### 11.9 `requireMention` 兼容字段

- 类型：`boolean`
- 状态：兼容旧配置，仍可用，但不推荐继续新增使用

映射关系：

- `true` -> `trigger.mode = "at"`
- `false` -> `trigger.mode = "any_message"`

如果你同时写了 `requireMention` 和 `trigger.mode`，新的 `trigger.mode` 优先。

### 11.10 `groups.<key>.bindingIdentity`

- 类型：

```json5
{
  "enabled": true,
  "selfNickname": {
    "source": "agent_name"
  },
  "remark": {
    "source": "agent_id"
  }
}
```

- 作用：定义“这个群已经绑定到某个 agent 后，机器人在群里应该显示成什么身份”
- 适用范围：只用于“已经通过顶层 `bindings[]` 显式绑定”的群
- 不会做的事：不会改群名

当前只同步两项：

- 机器人自己的群昵称 `selfNickname`
- 该群在机器人侧的群备注 `remark`

默认值：

- `enabled = true`
- `selfNickname.source = "agent_name"`
- `remark.source = "agent_id"`

### 11.11 `groups.<key>.bindingIdentity.enabled`

- 类型：`boolean`
- 作用：是否允许这个群执行绑定身份同步

如果设为 `false`：

- 绑定本身仍然可以生效
- 只是 `gewe_sync_group_binding` 不会对这个群执行同步

### 11.12 `groups.<key>.bindingIdentity.selfNickname`

- 类型：

```json5
{
  "source": "agent_name" // 或 agent_id / literal
}
```

- 作用：控制机器人在这个群里的“我在群里的昵称”应该是什么

`source` 可选值：

- `agent_name`
  使用 agent 的显示名；优先取 `agents.list[].name`，没有时回退到 `agentId`

- `agent_id`
  直接使用 `agentId`

- `literal`
  使用你手工指定的固定值；此时必须同时提供 `value`

示例：

```json5
{
  "groups": {
    "project-room@chatroom": {
      "bindingIdentity": {
        "selfNickname": {
          "source": "literal",
          "value": "项目助理"
        }
      }
    }
  }
}
```

### 11.13 `groups.<key>.bindingIdentity.remark`

- 类型：

```json5
{
  "source": "agent_id" // 或 agent_name / name_and_id / literal
}
```

- 作用：控制这个群在机器人侧显示的备注内容

`source` 可选值：

- `agent_id`
  备注写成 `agentId`

- `agent_name`
  备注写成 agent 显示名

- `name_and_id`
  备注写成 `Agent Name (agent-id)`

- `literal`
  使用固定值；此时必须同时提供 `value`

示例：

```json5
{
  "groups": {
    "*": {
      "bindingIdentity": {
        "remark": {
          "source": "name_and_id"
        }
      }
    }
  }
}
```

## 12. `dms`：按私聊对象做局部配置

`dms` 是一个对象，key 建议直接使用对方的 `wxid`。

```json5
{
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
```

### 12.1 `dms.<key>.historyLimit`

- 类型：整数，`>= 0`
- 作用：该私聊对象的局部历史窗口限制
- 说明：这是透传给 OpenClaw 宿主的上下文裁剪参数

### 12.2 `dms.<key>.skills`

- 类型：`string[]`
- 作用：该私聊对象允许的 skills

### 12.3 `dms.<key>.systemPrompt`

- 类型：`string`
- 作用：该私聊对象的局部系统提示词

### 12.4 `dms.<key>.trigger.mode`

- 类型：`"any_message" | "quote"`
- 默认值：`any_message`

含义如下：

- `any_message`
  该私聊对象的任意消息都能触发

- `quote`
  只有引用消息时才触发

### 12.5 `dms.<key>.reply.mode`

- 类型：`"plain" | "quote_source"`
- 默认值：
  - `autoQuoteReply !== false` 时默认 `quote_source`
  - `autoQuoteReply === false` 时默认 `plain`

说明：

- 私聊不支持 `at_sender`
- 私聊也不支持 `quote_and_at`

## 13. 历史、流式与输出相关字段

这部分字段有些是插件直接用，有些是交给 OpenClaw 宿主使用。为了避免误解，这里单独标出来。

### 13.1 `historyLimit`

- 类型：整数，`>= 0`
- 作用：群聊历史窗口限制
- 归属：主要由 OpenClaw 宿主在构建模型上下文时使用

### 13.2 `dmHistoryLimit`

- 类型：整数，`>= 0`
- 作用：私聊历史窗口限制
- 归属：主要由 OpenClaw 宿主使用

### 13.3 `textChunkLimit`

- 类型：正整数
- 作用：限制单条文本分片的长度
- 说明：GeWe 通道在插件元数据中默认暴露的文本上限是 4000；你可以通过该字段覆盖实际分片策略

### 13.4 `chunkMode`

- 类型：`"length" | "newline"`
- 作用：文本分片模式
- 说明：由宿主/通道出站分片逻辑配合使用

### 13.5 `autoQuoteReply`

- 类型：`boolean`
- 默认值：开启
- 作用：
  1. 普通文本回复带 `replyToId` 时，是否自动映射为 GeWe 引用回复气泡
  2. 当你没有显式配置 `reply.mode` 时，决定默认回复模式

### 13.6 `blockStreaming`

- 类型：`boolean`
- 作用：是否启用 block streaming
- 说明：GeWe 通道支持 block streaming；这个字段控制是否向宿主声明关闭/开启该行为

### 13.7 `blockStreamingCoalesce`

- 类型：

```json5
{
  "minChars": 800,
  "maxChars": 1200,
  "idleMs": 1000
}
```

- 作用：控制 block streaming 的合并策略
- 字段含义：
  - `minChars`：累计到多少字符后更倾向于发送
  - `maxChars`：单次合并最多多少字符
  - `idleMs`：空闲多久后把缓存块刷出去
- 归属：主要由 OpenClaw 宿主消费

### 13.8 `markdown`

- 类型：

```json5
{
  "tables": "off" // 或 "bullets" / "code"
}
```

- 作用：Markdown 输出细节控制
- 当前支持的子字段：
  - `tables: "off" | "bullets" | "code"`
- 归属：主要由 OpenClaw 宿主处理 Markdown 渲染/降级方式

## 14. 多账号配置

如果你需要一个插件实例管理多个 GeWe 账号，可以这样配：

```json5
{
  "channels": {
    "gewe-openclaw": {
      "enabled": true,
      "webhookHost": "0.0.0.0",
      "webhookPort": 4399,
      "webhookPath": "/webhook",
      "groupPolicy": "allowlist",
      "groups": {
        "*": {
          "trigger": { "mode": "at" },
          "reply": { "mode": "quote_source" }
        }
      },
      "accounts": {
        "work": {
          "name": "工作微信",
          "tokenFile": "/etc/openclaw/gewe-work.token",
          "appIdFile": "/etc/openclaw/gewe-work.appid",
          "groups": {
            "project@chatroom": {
              "trigger": { "mode": "at_or_quote" },
              "reply": { "mode": "quote_and_at" }
            }
          }
        },
        "personal": {
          "name": "个人微信",
          "tokenFile": "/etc/openclaw/gewe-personal.token",
          "appIdFile": "/etc/openclaw/gewe-personal.appid",
          "dmPolicy": "allowlist",
          "allowFrom": ["wxid_family_1", "wxid_family_2"]
        }
      }
    }
  }
}
```

### 多账号时的建议

- 公共默认值放顶层
- 真正不同的凭据和策略写在 `accounts.<accountId>`
- `groups` / `dms` 只把差异项写到账号级，减少重复

## 15. 常见配置场景示例

### 场景 A：任何私聊都能聊

```json5
{
  "channels": {
    "gewe-openclaw": {
      "dmPolicy": "open",
      "allowFrom": ["*"]
    }
  }
}
```

注意：

- `dmPolicy = "open"` 时，`allowFrom` 里必须包含 `"*"`

### 场景 B：群里只有被 `at` 才回复

```json5
{
  "groups": {
    "*": {
      "trigger": { "mode": "at" }
    }
  }
}
```

### 场景 C：某个群 quote 或 `at` 都能触发

```json5
{
  "groups": {
    "project@chatroom": {
      "trigger": { "mode": "at_or_quote" }
    }
  }
}
```

### 场景 D：某个群任何消息都回复，但只允许少数成员触发

```json5
{
  "groupPolicy": "allowlist",
  "groups": {
    "ops@chatroom": {
      "trigger": { "mode": "any_message" },
      "allowFrom": ["wxid_ops_1", "wxid_ops_2"]
    }
  }
}
```

### 场景 E：默认群里引用回复，某个群改成“引用并 `@`”

```json5
{
  "groups": {
    "*": {
      "reply": { "mode": "quote_source" }
    },
    "project@chatroom": {
      "reply": { "mode": "quote_and_at" }
    }
  }
}
```

### 场景 F：私聊默认都能聊，但某个人只有 quote 才触发

```json5
{
  "dmPolicy": "open",
  "allowFrom": ["*"],
  "dms": {
    "wxid_special": {
      "trigger": { "mode": "quote" }
    }
  }
}
```

### 场景 G：把某个群固定路由到 `ops` agent

```json5
{
  "bindings": [
    {
      "type": "route",
      "agentId": "ops",
      "match": {
        "channel": "gewe-openclaw",
        "peer": {
          "kind": "group",
          "id": "ops-room@chatroom"
        }
      }
    }
  ],
  "channels": {
    "gewe-openclaw": {
      "groups": {
        "ops-room@chatroom": {
          "trigger": { "mode": "at_or_quote" },
          "reply": { "mode": "quote_and_at" }
        }
      }
    }
  }
}
```

### 场景 H：把某个群绑定成 ACP 持久会话

```json5
{
  "bindings": [
    {
      "type": "acp",
      "agentId": "codex",
      "match": {
        "channel": "gewe-openclaw",
        "peer": {
          "kind": "group",
          "id": "repo-room@chatroom"
        }
      },
      "acp": {
        "label": "repo-room",
        "mode": "persistent",
        "cwd": "/workspace/repo-a"
      }
    }
  ]
}
```

### 场景 I：绑定后把机器人群昵称设成 agent 名称，备注设成“名称 + ID”

```json5
{
  "channels": {
    "gewe-openclaw": {
      "groups": {
        "*": {
          "bindingIdentity": {
            "selfNickname": { "source": "agent_name" },
            "remark": { "source": "name_and_id" }
          }
        }
      }
    }
  }
}
```

## 16. 配置校验与常见坑

### 16.1 `dmPolicy = "open"` 不是“什么都不用配”

这个插件会要求你显式写：

```json5
{
  "dmPolicy": "open",
  "allowFrom": ["*"]
}
```

如果只写 `dmPolicy: "open"`，schema 会报错。

### 16.2 `downloadMaxDelayMs` 不能小于 `downloadMinDelayMs`

错误写法：

```json5
{
  "downloadMinDelayMs": 1500,
  "downloadMaxDelayMs": 500
}
```

### 16.3 `groups` 建议用群 ID，不要依赖群名

最稳妥的是直接写：

```json5
{
  "groups": {
    "123456@chatroom": { }
  }
}
```

### 16.4 `allow` 和 `alsoAllow` 不能同时出现在 `tools` 里

错误写法：

```json5
{
  "groups": {
    "*": {
      "tools": {
        "allow": ["a"],
        "alsoAllow": ["b"]
      }
    }
  }
}
```

### 16.5 `quote` 触发不是“引用任何消息”

当前群聊 `quote` 的定义是：

- 只有引用“机器人自己的上一条消息”才算触发

这点非常适合做“继续追问”式交互，但不适合拿来当“引用任何人都能叫醒机器人”的模式。

### 16.6 顶层 `bindings[]` 才是“群绑定到 Agent”的入口

如果你想把某个微信群固定交给某个 agent，不要在 `groups` 里找 `agentId` 之类的字段。

正确做法是：使用 OpenClaw 顶层 `bindings[]`。

普通 route binding 示例：

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
  ]
}
```

说明：

- `match.channel` 固定写 `gewe-openclaw`
- 群聊写 `peer.kind = "group"`
- 私聊也能绑定，此时把 `peer.kind` 写成 `"direct"`，`peer.id` 写成对方 `wxid`
- `accountId` 可省略，省略时表示默认账号；也可以写 `"*"` 表示匹配任意账号
- 顶层 `bindings[]` 用于描述会话与 agent 的绑定关系

### 16.7 GeWe 的 ACP 绑定语义是“整群共享一个会话”

GeWe 群没有 Telegram topic、Feishu thread 这种子会话结构。

所以 ACP binding 在 GeWe 里的含义是：

- 整个群固定进入一个 ACP 持久会话
- 不是“群里不同话题各有一个 ACP 会话”

示例：

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

额外注意：

- 同一个群只配置一种绑定方式，不要同时配置 route binding 和 ACP binding

### 16.8 `bindingIdentity` 不是新的路由入口

很多人第一次看到 `bindingIdentity`，会误以为这是“把群绑到 agent”的地方。

不是。

它只负责“这个群已经绑定后，机器人在微信侧显示什么昵称/备注”，不负责决定路由。

也就是说：

- `bindings[]` 决定路由
- `groups.<groupId>.bindingIdentity` 决定显示身份

### 16.9 `gewe_sync_group_binding` 用于手动同步群绑定身份

同步方式如下：

- 插件启动时不会自动改群昵称或备注
- 需要 owner 手动调用 `gewe_sync_group_binding`

工具参数：

```json5
{
  "mode": "inspect", // inspect | dry_run | apply
  "groupId": "repo-room@chatroom",
  "accountId": "work",
  "syncSelfNickname": true,
  "syncRemark": true
}
```

模式区别：

- `inspect`：查看当前值、期望值、binding 命中情况
- `dry_run`：用于执行前确认 diff
- `apply`：只在目标值真的变化时调用 GeWe API

### 16.10 只有“显式绑定的群”才能做同步

`gewe_sync_group_binding` 不会对“只是默认落到 main agent 的群”做猜测式同步。

它要求这个群必须：

- 在顶层 `bindings[]` 里有显式命中项
- 并且 `bindingIdentity.enabled !== false`

这样做的好处是：

- 你不会误把一个临时群同步成某个 agent 的身份
- 群里的公开身份变化是可审计、可预期的

## 17. 一份完整、用户友好的示例

下面是一份偏生产可用的综合示例：

```json5
{
  "bindings": [
    {
      "type": "route",
      "agentId": "project",
      "match": {
        "channel": "gewe-openclaw",
        "accountId": "default",
        "peer": {
          "kind": "group",
          "id": "project-room@chatroom"
        }
      }
    }
  ],
  "channels": {
    "gewe-openclaw": {
      "enabled": true,
      "apiBaseUrl": "https://www.geweapi.com",
      "webhookHost": "0.0.0.0",
      "webhookPort": 4399,
      "webhookPath": "/webhook",
      "mediaHost": "0.0.0.0",
      "mediaPort": 4400,
      "mediaPath": "/gewe-media",
      "mediaPublicUrl": "https://bot.example.com/gewe-media",
      "mediaMaxMb": 20,

      "dmPolicy": "allowlist",
      "allowFrom": ["wxid_admin_1", "wxid_admin_2"],
      "groupPolicy": "allowlist",
      "groupAllowFrom": ["wxid_admin_1"],

      "groups": {
        "*": {
          "trigger": { "mode": "at" },
          "reply": { "mode": "quote_source" },
          "bindingIdentity": {
            "selfNickname": { "source": "agent_name" },
            "remark": { "source": "agent_id" }
          }
        },
        "project-room@chatroom": {
          "trigger": { "mode": "at_or_quote" },
          "reply": { "mode": "quote_and_at" },
          "skills": ["project-skill"],
          "systemPrompt": "You are the project room assistant.",
          "bindingIdentity": {
            "remark": { "source": "name_and_id" }
          },
          "tools": {
            "deny": ["exec_command"]
          }
        },
        "quiet-room@chatroom": {
          "enabled": false
        }
      },

      "dms": {
        "*": {
          "reply": { "mode": "quote_source" }
        },
        "wxid_admin_1": {
          "historyLimit": 50,
          "systemPrompt": "Prefer concise operational answers."
        }
      },

      "voiceAutoConvert": true,
      "silkAutoDownload": true,
      "autoQuoteReply": true,
      "blockStreaming": true,
      "blockStreamingCoalesce": {
        "minChars": 800,
        "maxChars": 1200,
        "idleMs": 1000
      },

      "accounts": {
        "backup": {
          "name": "备用微信",
          "tokenFile": "/etc/openclaw/gewe-backup.token",
          "appIdFile": "/etc/openclaw/gewe-backup.appid",
          "dmPolicy": "open",
          "allowFrom": ["*"],
          "groups": {
            "backup-room@chatroom": {
              "trigger": { "mode": "any_message" },
              "reply": { "mode": "plain" }
            }
          }
        }
      }
    }
  }
}
```

## 18. 最后给一个配置思路

如果你还不确定怎么配，推荐按下面顺序做：

1. 先配通
   只写 `enabled + token/appId + webhook`

2. 再收紧私聊
   用 `dmPolicy + allowFrom`

3. 再开放群聊
   先写 `groupPolicy + groups`

4. 再调群触发方式
   用 `groups.*.trigger.mode`

5. 如果要做群绑定
   再补顶层 `bindings[]` 和 `groups.<groupId>.bindingIdentity`

6. 最后再做体验优化
   用 `reply.mode`、`skills`、`systemPrompt`、`tools`、`blockStreamingCoalesce`

7. 需要时手动同步群身份
   由 owner 调用 `gewe_sync_group_binding` 的 `inspect / dry_run / apply`

如果你已经有一份 `openclaw.json`，也可以直接把 `channels.gewe-openclaw` 这一段贴出来，我可以继续帮你按你的实际使用场景整理成一份更合适的版本。

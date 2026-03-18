# GeWe Quote Message Design

**背景**

`gewe-openclaw` 现已支持文本、图片、语音、视频、文件、链接，以及一批 GeWe 富消息发送能力。但“引用消息”仍存在明显缺口：

- 官方 GeWe 回调里的引用消息会以 `MsgType=49 + appmsg.type=57 + refermsg` 形式出现。
- 当前插件对这类消息只会落入通用 `appmsg` 保真分支，缺少结构化解析与可读归一化。
- OpenClaw 宿主已经有通用 `replyToId` 语义，但 `gewe-openclaw` 还没有把它桥接成微信里的真实“引用回复”气泡。

结合官方文档与 `gewe-rs` 自身实现，引用消息已经具备一条低风险、高价值的闭环路径，值得优先补齐。

**目标**

在不修改 `openclaw` 宿主的前提下，只通过 `gewe-openclaw` 实现“引用消息闭环”：

1. 正确识别并解析入站引用消息
2. 向模型透传被引用内容与关键元数据
3. 让宿主的 `replyToId` 自动映射为 GeWe 引用回复
4. 允许通过 `channelData["gewe-openclaw"].quoteReply` 显式覆盖默认行为

本轮只聚焦引用消息，不顺手扩展到 emoji、名片、位置等其它入站富消息类型。

**依据**

- 官方文档 [消息模块/回调消息详解](/Users/wangnov/gewe-rs/docs/GeweAPI-Official/消息模块/回调消息详解.md) 已给出完整引用消息示例：
  - `MsgType=49`
  - `<appmsg><type>57</type>...<refermsg>...</refermsg></appmsg>`
- 官方文档 [消息模块/发送appmsg消息](/Users/wangnov/gewe-rs/docs/GeweAPI-Official/消息模块/发送appmsg消息.md) 明确说明 `postAppMsg` 可用于发送引用消息。
- `gewe-rs` 自身在 [dispatcher.rs](/Users/wangnov/gewe-rs/crates/gewe-bot-app/src/dispatcher.rs) 中已经采用：
  - 入站：通过 `<refermsg>` 将引用消息归一成可读文本
  - 出站：通过 `<appmsg><title>...</title><type>57</type><refermsg><svrid>...</svrid></refermsg></appmsg>` 发送引用回复

**设计原则**

1. 优先复用宿主已有语义，不引入额外的“GeWe 专属回复模式”概念。
2. 自动引用只覆盖“普通文本回复”，避免破坏现有媒体与富消息发送链路。
3. 结构化上下文要足够完整，既能给模型看，也能给后续工具/技能复用。
4. 显式覆盖能力保留在 `channelData["gewe-openclaw"]` 内，不把 GeWe 特有字段散到通用 payload 顶层。

**入站设计**

新增引用消息识别逻辑：

- 命中条件：
  - `MsgType=49`
  - 且 XML 中 `appmsg.type=57`，或存在 `<refermsg>`
- 解析字段：
  - `title`：当前这条引用回复的可见文本
  - `refermsg.type`：被引用消息类型
  - `refermsg.svrid`：被引用消息的 GeWe sid
  - `refermsg.fromusr`
  - `refermsg.chatusr`
  - `refermsg.displayname`
  - `refermsg.content`
  - `refermsg.msgsource`

入站归一化输出：

- 对文本引用，`RawBody` 形如：
  - `[引用:文本] 原始消息`
  - `回复内容`
- 对非文本引用，输出安全摘要，例如：
  - `[引用:文件] hhh.xlsx`
  - `看看这个`
- 若引用内容本身是 XML、媒体片段或无法安全展开，则不直接内嵌原文，只保留标签与标题，避免把整段 XML 暴露给模型正文。

入站上下文新增字段：

- `GeWeQuoteXml`
- `GeWeQuoteTitle`
- `GeWeQuoteType`
- `GeWeQuoteSvrid`
- `GeWeQuoteFromUsr`
- `GeWeQuoteChatUsr`
- `GeWeQuoteDisplayName`
- `GeWeQuoteContent`
- `GeWeQuoteMsgSource`

同时继续保留已有：

- `GeWeXml`
- `GeWeAppMsgXml`
- `GeWeAppMsgType`
- `MessageSid`

这样后续任何技能、工具或手工 payload 都能直接复用当前消息或被引用消息的关键标识。

**出站设计**

默认触发规则：

- 当 `ReplyPayload` 满足以下条件时，自动发送 GeWe 引用回复：
  - `payload.text` 非空
  - `payload.replyToId` 存在
  - 不存在更高优先级的 GeWe 富消息分支
  - 当前 payload 不是媒体/文件/链接/小程序/撤回/转发等既有专属分支

默认生成的 appmsg：

```xml
<appmsg>
  <title>回复内容</title>
  <type>57</type>
  <refermsg>
    <svrid>replyToId</svrid>
  </refermsg>
</appmsg>
```

显式覆盖结构：

```json
{
  "channelData": {
    "gewe-openclaw": {
      "quoteReply": {
        "svrid": "208008054840614808",
        "title": "这条是引用回复",
        "atWxid": "wxid_target_optional"
      }
    }
  }
}
```

规则：

- `quoteReply.svrid` 缺省时回退到 `payload.replyToId`
- `quoteReply.title` 缺省时回退到 `payload.text`
- `quoteReply.atWxid` 存在时，`refermsg.msgsource` 内嵌 `atuserlist`
- 仍保留 `appMsg` 作为最高自由度的终极出口；若调用方已经显式传完整 `appMsg`，插件不再代为生成 quote XML

建议的优先级：

1. `appMsg`
2. `quoteReply`
3. 既有 `emoji/nameCard/miniApp/revoke/forward`
4. `replyToId + text` 自动引用
5. 既有普通文本/媒体发送链路

这样既不会破坏已有显式 GeWe 能力，又能让宿主通用 reply 语义自然落成微信里的引用气泡。

**边界与非目标**

- 本轮不做“自动把图片/文件/小程序回复也包装成引用回复+媒体”的复合消息。
- 本轮不扩展到其它入站富消息类型的统一结构层。
- 本轮不依赖修改宿主 `openclaw` 的 `ReplyPayload` 或回复调度逻辑。
- 本轮不尝试构造任意复杂引用 XML，只采用 `gewe-rs` 已验证过的最小可用模板。

**核心改动点**

- [src/xml.ts](/Users/wangnov/gewe-openclaw/src/xml.ts)
  - 新增 `refermsg` 解析与引用消息摘要提取
- [src/inbound.ts](/Users/wangnov/gewe-openclaw/src/inbound.ts)
  - 增加 `type=57` 入站识别、可读归一化与上下文字段透传
- [src/delivery.ts](/Users/wangnov/gewe-openclaw/src/delivery.ts)
  - 扩展 `GeweChannelData.quoteReply`
  - 新增 `replyToId -> quote appmsg` 自动桥接
- [src/send.ts](/Users/wangnov/gewe-openclaw/src/send.ts)
  - 复用现有 `sendAppMsgGewe`，必要时补一个轻量 quote builder
- 测试：
  - [src/inbound-appmsg.test.ts](/Users/wangnov/gewe-openclaw/src/inbound-appmsg.test.ts)
  - [src/send-rich-message.test.ts](/Users/wangnov/gewe-openclaw/src/send-rich-message.test.ts)
  - 如有必要新增 `src/xml.test.ts`

**测试策略**

- 入站：
  - `type=57` 能正确识别为引用消息
  - 文本引用能归一成可读 `RawBody`
  - 非文本引用不会把整段 XML 泄露进正文
  - 上下文字段完整透传
- 出站：
  - `replyToId + text` 自动发 `type=57`
  - `quoteReply` 可覆盖 `svrid/title`
  - `quoteReply.atWxid` 会正确生成 `msgsource/atuserlist`
  - 已有 `appMsg` 与其它富消息优先级不被回归破坏
- 回归：
  - 普通文本无 `replyToId` 时仍走原文本发送
  - 媒体/文件/链接消息不会被自动引用逻辑错误拦截

**提交策略**

建议至少拆为以下原子提交：

1. 设计文档
2. 引用消息 XML 解析
3. 入站引用消息保真
4. 出站 `quoteReply` 显式能力
5. `replyToId` 自动桥接
6. 测试与文档更新

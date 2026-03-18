# GeWe Message Expansion Design

**背景**

`gewe-openclaw` 目前已经支持基础聊天通道所需的文本、图片、语音、视频、文件、链接六类出站消息，以及基础入站媒体下载与群策略控制。但官方 GeWe 消息模块仍有一批高价值消息能力尚未接入，包括：

- `postAppMsg`
- `postEmoji`
- `postNameCard`
- `postMiniApp`
- `revokeMsg`
- 各类 `forward-*`

当前插件的主要缺口不是“缺若干 API 包装”这么简单，而是富消息的通道语义尚未成型。现有 `channelData["gewe-openclaw"]` 只覆盖 `link`、`video`、`voiceDuration`、`fileName`、`forceFile`，富消息发送与复用能力没有统一结构，入站 `appmsg` 也只保留了链接和文件通知，其余大部分类型会被直接跳过。

**目标**

分两阶段补齐 GeWe 富消息主链：

1. 先补消息发送闭环
2. 再补消息复用能力

在不修改 `openclaw` 宿主的前提下，只通过 `gewe-openclaw` 提供更完整的微信消息能力。

**设计原则**

1. 继续沿用 `channelData["gewe-openclaw"]` 作为通道特有语义承载层，不把 GeWe 特有字段散落到通用 payload 顶层。
2. 先做“可直接发送”的高价值能力，再做“复用/转发/引用”的二阶能力。
3. 兼容现有 `link`、`video`、`voice` 语义，避免破坏已经稳定的基础消息发送链路。
4. 让后续新增 `forward-*`、引用消息、视频号分享时，可以直接复用同一个富消息分发框架。

**阶段一：消息发送闭环**

新增以下 GeWe 富消息结构：

- `appMsg`
  - 字段：`appmsg`
  - 对应接口：`postAppMsg`
  - 用途：发送任意 `<appmsg>` 载荷，覆盖引用消息、音乐分享、视频号分享等高价值场景
- `emoji`
  - 字段：`emojiMd5`、`emojiSize`
  - 对应接口：`postEmoji`
- `nameCard`
  - 字段：`nickName`、`nameCardWxid`
  - 对应接口：`postNameCard`
- `miniApp`
  - 字段：`miniAppId`、`displayName`、`pagePath`、`coverImgUrl`、`title`、`userName`
  - 对应接口：`postMiniApp`
- `revoke`
  - 字段：`msgId`、`newMsgId`、`createTime`
  - 对应接口：`revokeMsg`

发送优先级上，这些结构化富消息应先于普通 `mediaUrl/text` 分支被识别并下发，保证显式 GeWe 语义不会被普通文本/媒体逻辑吞掉。

**阶段二：消息复用能力**

新增以下复用/转发结构：

- `forward.image`
- `forward.video`
- `forward.file`
- `forward.link`
- `forward.miniApp`

这些结构统一以 `xml` 为主输入，必要时追加封面图、缩略图等辅助字段。这样可以对接 GeWe 官方“发送一次获取 cdn/xml，再二次转发”的建议模式。

同时，入站 `appmsg` 需要增强保真：

- 对未知 `appmsg` 类型不再简单丢弃
- 在可安全保留时，把原始 `xml` 或提取后的 `appmsg` 片段挂到上下文可消费结构里
- 为后续“收到即转发”“收到后引用”等能力预留数据基础

**核心改动点**

- [src/send.ts](/Users/wangnov/gewe-openclaw/src/send.ts)
  - 新增富消息 API 包装函数
- [src/delivery.ts](/Users/wangnov/gewe-openclaw/src/delivery.ts)
  - 扩展 `GeweChannelData`
  - 新增富消息分发优先级与校验逻辑
- [src/inbound.ts](/Users/wangnov/gewe-openclaw/src/inbound.ts)
  - 增强 `appmsg` 入站保真，为阶段二提供复用素材
- [src/types.ts](/Users/wangnov/gewe-openclaw/src/types.ts)
  - 如有必要，补充结构化类型
- 新增测试
  - 发送 API 请求体测试
  - `delivery` 富消息分发优先级测试
  - 入站 `appmsg` 保留/跳过策略测试

**测试策略**

阶段一：

- 为每个新增消息类型先写失败测试
- 验证 `delivery` 能正确识别结构化 `channelData`
- 验证 `send.ts` 请求体字段与官方文档一致
- 验证富消息优先级不会破坏既有 media/text 发送

阶段二：

- 验证 `forward-*` 分支能正确路由到对应 API
- 验证入站 `appmsg` 类型不再无条件丢弃
- 验证未知类型的降级策略可预测且不误发

**提交策略**

原子提交，建议至少拆为：

1. 设计与计划文档
2. `appMsg`
3. `emoji`
4. `nameCard`
5. `miniApp`
6. `revoke`
7. `forward-*`
8. 入站 `appmsg` 复用增强

# Changelog

All notable changes to this project will be documented in this file.

## [2026.3.18] - 2026-03-18

### Added

- GeWe 富消息发送能力扩展，新增：
  - 原始 `appmsg` XML 发送
  - 自定义表情发送
  - 名片发送
  - 小程序发送
  - 消息撤回
  - 图片、视频、文件、链接、小程序消息转发
- GeWe 入站 `appmsg` 复用链路，支持保留原始 XML 与上下文，便于后续二次转发、撤回或继续回复。
- GeWe 引用消息闭环支持，覆盖：
  - `type=57` 引用消息 XML 解析
  - 入站引用消息上下文保留
  - 显式 `quoteReply`
  - `replyToId + text` 自动桥接为 GeWe 引用回复
- GeWe 部分引用支持，覆盖：
  - `refermsg.partialtext` 解析
  - 出站 `quoteReply.partialText`
  - 回复部分引用消息时自动复用原始片段上下文
  - `[[GEWE_QUOTE_PARTIAL:...]]` 隐藏指令，允许模型主动发送部分引用
- `autoQuoteReply` 配置开关，可关闭 `replyToId + 纯文本` 的默认自动引用行为。
- 私聊配对码从宿主 pairing runtime 中解耦，支持在 GeWe 私聊中直接兑换并写入本地 allowlist。

### Changed

- GeWe 插件对当前 OpenClaw plugin-sdk 的类型与接口适配已整体补齐，包括 channel typing、inbound config、setup wizard、monitor runtime 与发送返回值类型。
- GeWe 状态与存储路径现在与 OpenClaw 统一，默认账号、命名账号和按账号隔离状态的行为更一致。
- GeWe 微信通道规则技能已增强，模型在微信通道中会按需生成部分引用隐藏指令。
- README 已补充富消息、引用回复、部分引用与 `autoQuoteReply` 的配置说明。

### Fixed

- 修复 webhook 请求体大小限制、启动失败上报与日志中的公网地址显示问题。
- 修复 webhook 同源媒体服务路径，确保 GeWe 媒体可经 webhook origin 正常访问。
- 修复 `voiceSilkPipe` 转换模式、生效范围以及 `audioAsVoice` 在出站单媒体场景中的保留问题。
- 修复 GeWe silk 下载与 Node Web Streams 的兼容问题。
- 修复 outbound chunk limit 默认值透传、wildcard group 配置回退、默认账号保留与顶层 group 默认配置继承问题。
- 修复按账号隔离的入站去重、pairing state、allowlist 与私聊配对流程。
- 修复撤回链路中的消息 ID 保留，确保后续 revoke 使用原始 GeWe 消息标识。
- 修复自动引用回复无法还原部分引用片段的问题。
- 修复 `replyToId` 自动桥接行为无法按需关闭的问题。

## [2026.3.14] - 2026-03-14

### Added

- GeWe gateway mode 支持，覆盖 gateway client、transport、download/send 通路以及配置 schema/onboarding 对应入口。
- Gateway runtime status 暴露能力，便于监控当前 GeWe 网关连接与运行状态。

### Changed

- `channel`、`monitor` 与 `README` 已增加 gateway 模式与运行态状态展示的配套说明。

## [2026.3.13] - 2026-03-13

### Added

- 初始版本发布。
- 提供基于 GeWe API + webhook 回调的 OpenClaw 微信通道插件骨架。
- 包含基础账号解析、通道配置、收发消息、媒体服务、下载队列、路由策略、XML 解析与插件入口文件。

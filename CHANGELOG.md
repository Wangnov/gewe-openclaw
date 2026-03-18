# Changelog

All notable changes to this project will be documented in this file.

## [2026.3.18] - 2026-03-18

### Added

- GeWe 引用消息闭环支持：
  - 入站解析 `type=57` 引用消息 XML
  - 保留引用上下文到 OpenClaw 会话
  - 支持显式 `quoteReply`
  - 支持 `replyToId + text` 自动桥接为 GeWe 引用回复
- GeWe 部分引用支持：
  - 解析 `refermsg.partialtext`
  - 出站支持 `quoteReply.partialText`
  - 回复部分引用消息时自动复用原始片段上下文
  - 新增 `[[GEWE_QUOTE_PARTIAL:...]]` 隐藏指令，允许模型主动发送部分引用
- 自动引用回复配置开关 `autoQuoteReply`

### Changed

- GeWe 微信通道规则技能已增强，模型在微信通道中会按需生成部分引用隐藏指令。
- README 已补充引用回复、部分引用和 `autoQuoteReply` 的配置说明。

### Fixed

- 修复自动引用回复无法还原部分引用片段的问题。
- 修复 `replyToId` 自动桥接行为无法按需关闭的问题。

# Changelog

All notable changes to this project will be documented in this file.

## [2026.3.23] - 2026-03-19

### Added

- 仓库新增 tag 驱动的 npm 发布工作流，推送 `v*` tag 后会自动执行发版流程。

### Changed

- npm 发版前现在会自动校验版本号、CHANGELOG、测试与打包结果，降低误发版风险。
- README 补充了维护者发布说明，包括 Trusted Publisher 配置要点和日常发版步骤。

## [2026.3.22] - 2026-03-19

### Added

- GeWe 补齐官方联系人、群、朋友圈、个人资料四大模块的 API 封装，覆盖好友信息、群资料、朋友圈读取与发布、个人资料与隐私相关能力。
- 新增四个 agent 可直接调用的 GeWe 工具：`gewe_contacts`、`gewe_groups`、`gewe_moments`、`gewe_personal`。
- 新增 `gewe-agent-tools` skill，指导 agent 选择正确工具、利用当前私聊或群会话推断目标，并区分只读与写操作。

### Changed

- GeWe directory 现在会按需拉取通讯录并用联系人 brief 信息补全名字，后续 allowlist 名称解析也会复用这批缓存。
- GeWe 群绑定和资料读取相关逻辑已统一收口到新的官方 API 包装层，减少重复请求封装并保持行为一致。

## [2026.3.21] - 2026-03-19

### Added

- GeWe 接入共享 `message` 工具动作，支持 `send`、`reply`、`unsend`，并新增 `gewe` 扩展参数来表达引用、表情、名片、小程序和转发语义。
- GeWe 通道新增目录能力，支持查看当前账号自身信息、已知私聊对象、已知群，以及按需读取群成员列表。
- 新增 `gewe_manage_group_allowlist` 工具，用于查看和编辑单群 `allowFrom` 覆盖，支持 `inspect`、`add`、`remove`、`replace`、`clear`。

### Changed

- GeWe 现已接入标准 allowlist 适配，可直接读取和编辑顶层 `allowFrom` / `groupAllowFrom`，并在展示时带出群局部覆盖摘要。
- GeWe 状态摘要现在包含 API 探活、自身身份、目录规模、显式绑定数量、群覆盖数量和 pairing 本地 allow-from 统计。
- README 与 `openclaw.json` 配置手册补充了 actions、directory、allowlist、status 的用法示例和操作说明。

## [2026.3.20] - 2026-03-18

### Added

- GeWe 会话支持通过顶层 `bindings[]` 配置显式绑定目标 agent，便于按群或私聊拆分不同助手。
- 新增 `groups[*].bindingIdentity` 配置，可按 `agent_name`、`agent_id` 或自定义字面量生成机器人群昵称与群备注。
- 新增 `gewe_sync_group_binding` 工具，用于查看、预演并同步群绑定身份信息。

### Changed

- README 与 `openclaw.json` 配置手册新增群绑定、ACP 绑定、`bindingIdentity` 与同步流程示例。
- 配置文档整体改写为面向使用者的说明，聚焦“怎么配、怎么用、有什么效果”。

## [2026.3.19] - 2026-03-18

### Added

- GeWe 群聊与私聊规则配置新增 `trigger.mode` / `reply.mode`，支持按 `groups`、`dms`、`*` 默认项与账号级配置组合覆写。
- 群聊触发规则支持 `at`、`quote`、`at_or_quote`、`any_message`；私聊触发规则支持 `any_message`、`quote`。
- 群聊回复规则支持 `plain`、`quote_source`、`at_sender`、`quote_and_at`；私聊回复规则支持 `plain`、`quote_source`。
- 新增完整的 `openclaw.json` 配置手册，覆盖顶层、账号级、群聊、私聊、多账号、媒体与安全配置说明。

### Changed

- GeWe 文档与提示文案统一改用 `at` 术语，不再使用 `mention` 作为面对用户的配置描述。
- 命名账号现在会继承并合并顶层 `dms` 默认配置，和现有 `groups` 继承行为保持一致。
- `autoQuoteReply` 现在作为未显式配置 `reply.mode` 时的默认回退，而不是唯一的引用回复开关。

### Fixed

- 修复群聊触发判断只能基于 `@` 的限制，引用机器人消息现在可按规则参与触发。
- 修复私聊局部规则无法透传 `skills` / `systemPrompt` 与无法按 `dms` wildcard 覆写的问题。
- 修复 `quote_and_at` 在非文本回复上的行为，现会安全退化为 `quote_source`。

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

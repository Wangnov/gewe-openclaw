# OpenClaw 新版 SDK 升级兼容公告

日期：2026-03-24

## 概要

本次更新面向 OpenClaw 新版插件加载模型做了兼容改造，同时保留了对旧版宿主的兼容支持。

用户升级到新版 OpenClaw 后，只要同时升级到本版 `gewe-openclaw`，通常可以直接延续原有配置与使用方式，无需改 `channel id`、配置键或插件安装方式。

## 这次改了什么

- 增加 `setup-entry.ts`，适配新版 OpenClaw 的 `setupEntry` / `setup-only` 加载路径。
- 插件主入口按 `registrationMode` 分流：
  - `full` 模式下继续注册完整 GeWe 通道与 agent 工具。
  - `setup-only` / `setup-runtime` 模式下只注册 channel setup surface，避免提前加载重运行时代码。
- 把 setup 所需的轻量 surface 单独抽离，避免新版 OpenClaw 在 onboarding、disabled channel inspection、未配置通道检查时加载完整 GeWe 运行时。
- 保留旧版宿主兼容逻辑：
  - 旧宿主没有 `registrationMode` 时，仍按原行为注册 channel 与工具。
  - 仍兼容当前对外部插件可用的根 SDK 入口，不强制要求宿主必须支持新版 helper 写法。

## 对用户意味着什么

以下内容保持不变：

- 插件包名仍是 `gewe-openclaw`
- 插件 `id` 仍是 `gewe-openclaw`
- channel `id` 仍是 `gewe-openclaw`
- 配置主键仍是 `channels.gewe-openclaw`
- 已有 GeWe 账号配置、群规则、私聊规则、bindings、allowlist 配置无需改写

对大多数用户来说，升级路径就是：

1. 升级 OpenClaw 到新版
2. 升级 `gewe-openclaw` 到本版
3. 保持原有配置启动

## 兼容矩阵

| 场景 | 结果 |
| --- | --- |
| 旧版 OpenClaw + 本版插件 | 支持 |
| 新版 OpenClaw + 本版插件 | 支持 |
| 新版 OpenClaw setup-only / setup-runtime 加载 | 支持 |
| 已配置通道的 defer-after-listen 启动模式 | 本版未主动启用 |

说明：

- 本版已经完整跟进当前新版 OpenClaw 的入口与 setup 加载模型。
- 但为了继续兼容旧宿主，本版没有强制全面切到 `defineChannelPluginEntry` / `defineSetupPluginEntry` 的纯新版写法，而是实现了与其行为等价的兼容入口逻辑。
- 这属于有意保留的兼容层，不是漏改。

## 何时可以无缝升级

满足以下任一条件的用户，通常可以无缝升级：

- 你当前已经使用默认的 `~/.openclaw` 状态目录
- 你已经显式设置了 `OPENCLAW_STATE_DIR`
- 你历史上使用的是 `CLAWDBOT_STATE_DIR`，并且该环境变量仍保留

在这些情况下，升级后原有本地状态通常会继续被读取，包括：

- pairing / allow-from 本地状态
- 群认领码与相关本地 store
- 目录缓存与其他插件本地状态

## 唯一需要特别提醒的边界

如果你是非常早期的用户，历史状态数据仍放在旧默认目录里，而且：

- 当前没有迁移到 `~/.openclaw`
- 也没有设置 `OPENCLAW_STATE_DIR`
- 同时没有保留旧的 `CLAWDBOT_STATE_DIR`

那么升级后，OpenClaw / 插件不会自动扫描旧默认目录。

这时你需要二选一：

- 手动把旧状态目录迁到 `~/.openclaw`
- 或显式设置 `OPENCLAW_STATE_DIR` 指向旧状态目录

如果不做这一步，本地 store 可能无法自动续上，表现为：

- 需要重新建立部分 pairing / allow-from 状态
- 群认领相关的本地短期状态不会自动继承

## 当前版本的取舍

本版没有启用 `deferConfiguredChannelFullLoadUntilAfterListen`。

原因是 GeWe 仍包含 webhook、gateway、monitor 等运行时入口。当前 `setupEntry` 已足够覆盖新版 setup/onboarding 场景，但我们没有把“已配置通道的完整运行时延后到 listen 后再加载”作为默认行为，以避免引入额外启动阶段行为差异。

## 建议

- 普通用户：直接升级 OpenClaw 与本插件即可。
- 有自定义部署脚本的用户：确认部署环境里仍保留正确的状态目录变量。
- 使用很早期安装方式的用户：升级前先确认本地状态目录位置，必要时先迁移再升级。

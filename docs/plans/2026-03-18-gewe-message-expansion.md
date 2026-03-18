# GeWe Message Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `gewe-openclaw` 增加 GeWe 富消息发送闭环与消息复用能力，覆盖 `appMsg`、`emoji`、`nameCard`、`miniApp`、`revoke` 以及 `forward-*`。

**Architecture:** 继续使用 `channelData["gewe-openclaw"]` 作为通道特有富消息语义入口，在 `delivery` 里统一识别并分发到 `send.ts` 的 GeWe API 包装函数。第二阶段增强入站 `appmsg` 保真，为转发/复用提供原始素材。

**Tech Stack:** TypeScript、Node.js、OpenClaw channel plugin、GeWe HTTP API、Node test runner

---

### Task 1: 设计与计划文档落库

**Files:**
- Create: `docs/plans/2026-03-18-gewe-message-expansion-design.md`
- Create: `docs/plans/2026-03-18-gewe-message-expansion.md`

**Step 1: 写设计文档**

记录范围、阶段划分、结构化 `channelData` 方案、测试策略和提交切面。

**Step 2: 写实施计划**

把功能拆成 TDD 小步任务，明确文件和验证命令。

**Step 3: 提交**

Run: `git add docs/plans/2026-03-18-gewe-message-expansion-design.md docs/plans/2026-03-18-gewe-message-expansion.md && git commit -m "docs: plan GeWe message expansion"`

Expected: 成功生成一笔仅包含文档的提交

### Task 2: 补 `postAppMsg`

**Files:**
- Modify: `src/send.ts`
- Modify: `src/delivery.ts`
- Test: `src/send-rich-message.test.ts`

**Step 1: 写失败测试**

新增测试覆盖：

- `sendAppMsgGewe()` 会向 `/gewe/v2/api/message/postAppMsg` 发送 `appId`、`toWxid`、`appmsg`
- `deliverGewePayload()` 在 `channelData["gewe-openclaw"].appMsg` 存在时优先走 `postAppMsg`

**Step 2: 跑测试确认失败**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts`

Expected: 因 `sendAppMsgGewe` 未定义或分发未命中而失败

**Step 3: 写最小实现**

- 在 `src/send.ts` 新增 `sendAppMsgGewe`
- 在 `src/delivery.ts` 的富消息分发前段新增 `appMsg` 分支

**Step 4: 跑测试确认通过**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts`

Expected: `appMsg` 用例通过

**Step 5: 提交**

Run: `git add src/send.ts src/delivery.ts src/send-rich-message.test.ts && git commit -m "feat: add GeWe appmsg sending"`

### Task 3: 补 `postEmoji`

**Files:**
- Modify: `src/send.ts`
- Modify: `src/delivery.ts`
- Modify: `src/send-rich-message.test.ts`

**Step 1: 写失败测试**

新增测试覆盖：

- `sendEmojiGewe()` 的请求路径与请求体
- `delivery` 能识别 `channelData["gewe-openclaw"].emoji`

**Step 2: 跑测试确认失败**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts`

Expected: emoji 用例失败

**Step 3: 写最小实现**

- 在 `src/send.ts` 新增 `sendEmojiGewe`
- 在 `src/delivery.ts` 增加 `emoji` 分支

**Step 4: 跑测试确认通过**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts`

Expected: emoji 用例通过

**Step 5: 提交**

Run: `git add src/send.ts src/delivery.ts src/send-rich-message.test.ts && git commit -m "feat: add GeWe emoji sending"`

### Task 4: 补 `postNameCard`

**Files:**
- Modify: `src/send.ts`
- Modify: `src/delivery.ts`
- Modify: `src/send-rich-message.test.ts`

**Step 1: 写失败测试**

新增测试覆盖：

- `sendNameCardGewe()` 的请求路径与字段
- `delivery` 能识别 `nameCard`

**Step 2: 跑测试确认失败**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts`

Expected: 名片用例失败

**Step 3: 写最小实现**

- 在 `src/send.ts` 新增 `sendNameCardGewe`
- 在 `src/delivery.ts` 增加 `nameCard` 分支

**Step 4: 跑测试确认通过**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts`

Expected: 名片用例通过

**Step 5: 提交**

Run: `git add src/send.ts src/delivery.ts src/send-rich-message.test.ts && git commit -m "feat: add GeWe name card sending"`

### Task 5: 补 `postMiniApp`

**Files:**
- Modify: `src/send.ts`
- Modify: `src/delivery.ts`
- Modify: `src/send-rich-message.test.ts`

**Step 1: 写失败测试**

新增测试覆盖：

- `sendMiniAppGewe()` 的请求路径与字段
- `delivery` 能识别 `miniApp`

**Step 2: 跑测试确认失败**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts`

Expected: 小程序用例失败

**Step 3: 写最小实现**

- 在 `src/send.ts` 新增 `sendMiniAppGewe`
- 在 `src/delivery.ts` 增加 `miniApp` 分支

**Step 4: 跑测试确认通过**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts`

Expected: 小程序用例通过

**Step 5: 提交**

Run: `git add src/send.ts src/delivery.ts src/send-rich-message.test.ts && git commit -m "feat: add GeWe mini app sending"`

### Task 6: 补 `revokeMsg`

**Files:**
- Modify: `src/send.ts`
- Modify: `src/delivery.ts`
- Modify: `src/send-rich-message.test.ts`

**Step 1: 写失败测试**

新增测试覆盖：

- `revokeMessageGewe()` 的请求路径与字段
- `delivery` 能识别 `revoke`

**Step 2: 跑测试确认失败**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts`

Expected: 撤回用例失败

**Step 3: 写最小实现**

- 在 `src/send.ts` 新增 `revokeMessageGewe`
- 在 `src/delivery.ts` 增加 `revoke` 分支

**Step 4: 跑测试确认通过**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts`

Expected: 撤回用例通过

**Step 5: 提交**

Run: `git add src/send.ts src/delivery.ts src/send-rich-message.test.ts && git commit -m "feat: add GeWe message revoke"`

### Task 7: 补 `forward-*` 发送 API

**Files:**
- Modify: `src/send.ts`
- Modify: `src/delivery.ts`
- Modify: `src/send-rich-message.test.ts`

**Step 1: 写失败测试**

新增测试覆盖：

- `forwardImageGewe`
- `forwardVideoGewe`
- `forwardFileGewe`
- `forwardLinkGewe`
- `forwardMiniAppGewe`
- `delivery` 能识别 `forward` 结构并命中正确 API

**Step 2: 跑测试确认失败**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts`

Expected: forward 用例失败

**Step 3: 写最小实现**

- 在 `src/send.ts` 添加 5 个转发 API 包装
- 在 `src/delivery.ts` 增加 `forward` 分支与子类型分发

**Step 4: 跑测试确认通过**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts`

Expected: forward 用例通过

**Step 5: 提交**

Run: `git add src/send.ts src/delivery.ts src/send-rich-message.test.ts && git commit -m "feat: add GeWe forward message delivery"`

### Task 8: 增强入站 `appmsg` 保真

**Files:**
- Modify: `src/inbound.ts`
- Test: `src/inbound-appmsg.test.ts`

**Step 1: 写失败测试**

新增测试覆盖：

- 链接类 `appmsg` 继续保持已有解析行为
- 未知/富类型 `appmsg` 不再简单返回 `null`
- 入站结果会保留后续可复用的 `xml` 或 `appmsg` 片段

**Step 2: 跑测试确认失败**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/inbound-appmsg.test.ts`

Expected: 因当前未知 `appmsg` 被直接跳过而失败

**Step 3: 写最小实现**

- 调整 `src/inbound.ts` 的 `msgType === 49` 分支
- 在不破坏现有文本回退的前提下保留富消息原始素材

**Step 4: 跑测试确认通过**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/inbound-appmsg.test.ts`

Expected: 入站 `appmsg` 用例通过

**Step 5: 提交**

Run: `git add src/inbound.ts src/inbound-appmsg.test.ts && git commit -m "feat: preserve GeWe appmsg payloads for reuse"`

### Task 9: 全量相关回归

**Files:**
- Modify: `README.md`
- Test: `src/send-rich-message.test.ts`
- Test: `src/inbound-appmsg.test.ts`
- Test: `src/channel-outbound.test.ts`
- Test: `src/delivery-voice-pipe.test.ts`
- Test: `src/monitor-webhook.test.ts`

**Step 1: 补 README**

补充新增 `channelData["gewe-openclaw"]` 富消息结构说明与示例。

**Step 2: 跑相关测试**

Run: `node node_modules/openclaw/node_modules/tsx/dist/cli.mjs --test src/send-rich-message.test.ts src/inbound-appmsg.test.ts src/channel-outbound.test.ts src/delivery-voice-pipe.test.ts src/monitor-webhook.test.ts`

Expected: 全部通过

**Step 3: 提交**

Run: `git add README.md src/send-rich-message.test.ts src/inbound-appmsg.test.ts src/channel-outbound.test.ts src/delivery-voice-pipe.test.ts src/monitor-webhook.test.ts && git commit -m "docs: document GeWe rich message support"`

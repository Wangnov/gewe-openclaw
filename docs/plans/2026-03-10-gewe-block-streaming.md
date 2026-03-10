# GeWe Block Streaming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 GeWe 通道真正把 OpenClaw 的 block streaming 接到入站回复链路中。

**Architecture:** 新增一个独立 helper 负责解析 GeWe 的 replyOptions，再在 GeWe 入站分发时把 `disableBlockStreaming` 传给核心 dispatcher。保持发送层不变，只启用 block 级分段发送。

**Tech Stack:** TypeScript, Node.js test runner, OpenClaw plugin-sdk

---

### Task 1: 固化 GeWe block streaming 配置语义

**Files:**
- Create: `src/reply-options.ts`
- Test: `src/reply-options.test.ts`

**Step 1: 写失败测试**

验证 GeWe 默认开启 block streaming，显式 `false` 关闭，显式 `true` 开启。

**Step 2: 运行测试确认失败**

Run: `node --experimental-transform-types --test src/reply-options.test.ts`

**Step 3: 写最小实现**

新增 `resolveGeweReplyOptions()` helper，返回 `disableBlockStreaming`。

**Step 4: 运行测试确认通过**

Run: `node --experimental-transform-types --test src/reply-options.test.ts`

### Task 2: 将 replyOptions 接入 GeWe 入站分发

**Files:**
- Modify: `src/inbound.ts`
- Modify: `src/reply-options.ts`

**Step 1: 在入站分发中使用 helper**

给 `dispatchReplyWithBufferedBlockDispatcher(...)` 传入 `replyOptions`。

**Step 2: 跑回归测试**

Run: `node --experimental-transform-types --test src/reply-options.test.ts`

**Step 3: 做一次类型层验证**

Run: `node --experimental-transform-types ./node_modules/typescript/bin/tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 src/reply-options.ts src/inbound.ts`

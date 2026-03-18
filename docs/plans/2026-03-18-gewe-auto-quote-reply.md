# GeWe Auto Quote Reply Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 GeWe 自动引用回复增加可选配置开关，允许用户显式关闭自动 quote。

**Architecture:** 在账号配置中新增 `autoQuoteReply?: boolean`，默认按 `true` 处理。只影响 `delivery.ts` 中“replyToId + 纯文本自动桥接为引用回复”的分支；显式 `quoteReply` 分支保持原样。

**Tech Stack:** TypeScript, Zod, Node test runner, tsx

---

### Task 1: 补关闭自动引用的失败测试

**Files:**
- Modify: `src/send-rich-message.test.ts`

**Step 1: Write the failing test**

新增一个测试：当 `account.config.autoQuoteReply = false` 且 payload 只有 `text + replyToId` 时，应该命中普通文本发送接口，而不是 `postAppMsg`。

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/send-rich-message.test.ts`

Expected: 新测试失败，说明当前没有配置开关。

**Step 3: Write minimal implementation**

只在自动引用分支前增加配置判断，不改显式 `quoteReply` 分支。

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/send-rich-message.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/send-rich-message.test.ts src/delivery.ts src/types.ts src/config-schema.ts README.md
git commit -m "feat: make GeWe auto quote reply configurable"
```

### Task 2: 补配置类型与文档

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config-schema.ts`
- Modify: `README.md`

**Step 1: Add type**

在 `GeweAccountConfig` 中新增：

```ts
autoQuoteReply?: boolean;
```

**Step 2: Add schema**

在 `GeweAccountSchemaBase` 中新增：

```ts
autoQuoteReply: z.boolean().optional();
```

**Step 3: Document behavior**

在 README 配置说明和引用消息说明里补充：
- 默认开启
- `false` 时关闭自动引用
- 显式 `quoteReply` 不受影响

**Step 4: Verify**

Run: `node --import tsx --test src/*.test.ts`

Expected: PASS

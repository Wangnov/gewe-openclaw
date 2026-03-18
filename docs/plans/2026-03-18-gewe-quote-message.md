# GeWe Quote Message Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `gewe-openclaw` 补齐引用消息闭环，让入站 `type=57` 可读可复用，并让宿主 `replyToId` 自然映射为 GeWe 引用回复。

**Architecture:** 先在 `src/xml.ts` 补齐 `refermsg` 解析，再把 `src/inbound.ts` 的 `type=57` 识别与上下文透传接上，最后在 `src/delivery.ts` 增加显式 `quoteReply` 和 `replyToId` 自动桥接。出站仍复用既有 `sendAppMsgGewe`，避免扩张发送层 API 面。

**Tech Stack:** TypeScript, Node test runner, `tsx`, OpenClaw plugin SDK, GeWe XML payloads

---

### Task 1: 引用消息 XML 解析基座

**Files:**
- Create: `src/xml.test.ts`
- Modify: `src/xml.ts`

**Step 1: Write the failing test**

在 `src/xml.test.ts` 增加以下覆盖：

```ts
test("extractQuoteDetails 会解析 type=57 引用消息", () => {
  const xml = `<msg><appmsg><type>57</type><title>回复内容</title><refermsg><type>1</type><svrid>123</svrid><fromusr>wxid_a</fromusr><displayname>张三</displayname><content>原始文本</content></refermsg></appmsg></msg>`;
  assert.deepEqual(extractQuoteDetails(xml), {
    title: "回复内容",
    referType: 1,
    svrid: "123",
    fromUsr: "wxid_a",
    displayName: "张三",
    content: "原始文本",
  });
});

test("extractQuoteSummary 会为文本引用生成可读摘要", () => {
  const xml = `<msg><appmsg><type>57</type><title>回复内容</title><refermsg><type>1</type><content>原始文本</content></refermsg></appmsg></msg>`;
  assert.deepEqual(extractQuoteSummary(xml), {
    body: "[引用:文本] 原始文本\n回复内容",
    quoteLabel: "文本",
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/xml.test.ts`

Expected: FAIL with missing export / assertion mismatch for quote helpers

**Step 3: Write minimal implementation**

在 `src/xml.ts` 新增：

- `extractQuoteDetails(xml)`
- `extractQuoteSummary(xml)`
- 引用类型到标签的最小映射，例如 `1 -> 文本`、`3 -> 图片`、`6 -> 文件`、`43 -> 视频`、`49 -> 卡片`

要求：

- 继续复用现有 `extractXmlTag` / entity decode
- 当引用内容是 XML 或媒体片段时，不把整段 XML直接塞回摘要正文
- 返回值中保留原始 `content` 供上层决定如何透传

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/xml.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/xml.ts src/xml.test.ts
git commit -m "feat: parse GeWe quote message xml"
```

### Task 2: 入站引用消息保真

**Files:**
- Modify: `src/inbound.ts`
- Modify: `src/inbound-appmsg.test.ts`
- Modify: `src/xml.ts`
- Modify: `src/xml.test.ts`

**Step 1: Write the failing test**

在 `src/inbound-appmsg.test.ts` 增加：

```ts
test("type=57 引用消息会归一成可读正文并透传上下文字段", async () => {
  // 断言 RawBody 包含 [引用:文本] 原始文本 与 回复内容
  // 断言 ctx.GeWeQuoteTitle / GeWeQuoteType / GeWeQuoteSvrid / GeWeQuoteContent 存在
  // 断言 ctx.GeWeAppMsgType === 57
});
```

再补一个非文本引用用例：

```ts
test("type=57 非文本引用不会把整段 xml 泄露进 RawBody", async () => {
  // refermsg.content 含 <msg>...</msg> 或 <img ... />
  // 断言 RawBody 只保留 [引用:文件] / [引用:图片] + title
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/inbound-appmsg.test.ts src/xml.test.ts`

Expected: FAIL with missing quote-specific normalization / ctx fields

**Step 3: Write minimal implementation**

在 `src/inbound.ts` 中：

- 在 `normalizeInboundEntry` 里优先识别 `appmsg.type=57`
- 用 `extractQuoteSummary` 生成 `rawBody`
- 在 `dispatchGeweInbound` 的 `ctxPayload` 中补充：
  - `GeWeQuoteXml`
  - `GeWeQuoteTitle`
  - `GeWeQuoteType`
  - `GeWeQuoteSvrid`
  - `GeWeQuoteFromUsr`
  - `GeWeQuoteChatUsr`
  - `GeWeQuoteDisplayName`
  - `GeWeQuoteContent`
  - `GeWeQuoteMsgSource`

要求：

- 继续保留已有 `GeWeXml` / `GeWeAppMsgXml` / `GeWeAppMsgType`
- 不改变现有链接、文件通知、小程序等 `appmsg` 的既有行为

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/inbound-appmsg.test.ts src/xml.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/inbound.ts src/inbound-appmsg.test.ts src/xml.ts src/xml.test.ts
git commit -m "feat: preserve GeWe quote messages inbound"
```

### Task 3: 显式 `quoteReply` 出站能力

**Files:**
- Modify: `src/delivery.ts`
- Modify: `src/send-rich-message.test.ts`

**Step 1: Write the failing test**

在 `src/send-rich-message.test.ts` 增加：

```ts
test("deliverGewePayload 会发送显式 quoteReply", async () => {
  // payload.channelData["gewe-openclaw"].quoteReply = { svrid, title }
  // 断言命中 /gewe/v2/api/message/postAppMsg
  // 断言 appmsg 含 <type>57</type> 和 <svrid>...</svrid>
});

test("quoteReply.atWxid 会生成 refermsg.msgsource atuserlist", async () => {
  // 断言生成的 appmsg 中存在编码后的 <msgsource><atuserlist>...</atuserlist></msgsource>
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/send-rich-message.test.ts`

Expected: FAIL with missing `quoteReply` branch

**Step 3: Write minimal implementation**

在 `src/delivery.ts` 中：

- 扩展 `GeweChannelData` 增加：

```ts
quoteReply?: {
  svrid?: string | number;
  title?: string;
  atWxid?: string;
};
```

- 新增轻量 quote appmsg builder
- 在 `deliverGewePayload` 中插入显式 `quoteReply` 分支：
  - `svrid` 缺省时回退 `payload.replyToId`
  - `title` 缺省时回退 `payload.text`
  - 通过既有 `sendAppMsgGewe` 发送

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/send-rich-message.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/delivery.ts src/send-rich-message.test.ts
git commit -m "feat: add explicit GeWe quote replies"
```

### Task 4: `replyToId` 自动桥接到引用回复

**Files:**
- Modify: `src/delivery.ts`
- Modify: `src/send-rich-message.test.ts`

**Step 1: Write the failing test**

在 `src/send-rich-message.test.ts` 增加：

```ts
test("replyToId + text 会自动发送引用回复", async () => {
  // payload.text = "收到"
  // payload.replyToId = "208008054840614808"
  // 断言命中 postAppMsg 且 svrid 来自 replyToId
});

test("媒体 payload 不会被自动引用逻辑拦截", async () => {
  // payload.mediaUrl 存在且 replyToId 存在
  // 断言仍走既有媒体发送分支，而不是 postAppMsg
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/send-rich-message.test.ts`

Expected: FAIL with text reply still走普通文本发送

**Step 3: Write minimal implementation**

在 `src/delivery.ts` 中：

- 在显式 `quoteReply` 之后增加自动桥接分支
- 只在以下条件满足时触发：
  - `payload.text` 非空
  - `payload.replyToId` 存在
  - 不存在媒体 / 文件 / 链接 / 小程序 / 撤回 / 转发 / appMsg / emoji / 名片等更高优先级分支

要求：

- 自动桥接只覆盖普通文本
- 继续保持 `appMsg` 和显式 `quoteReply` 优先级更高

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/send-rich-message.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/delivery.ts src/send-rich-message.test.ts
git commit -m "feat: bridge replyToId to GeWe quote replies"
```

### Task 5: 文档与回归收口

**Files:**
- Modify: `README.md`
- Modify: `src/inbound-appmsg.test.ts`
- Modify: `src/send-rich-message.test.ts`
- Modify: `src/xml.test.ts`

**Step 1: Write the failing regression test**

补齐最终组合验证：

```ts
test("引用消息闭环回归组合", async () => {
  // 1. 入站 type=57 可读
  // 2. 显式 quoteReply 正常
  // 3. 自动 replyToId 正常
  // 4. 普通媒体不受影响
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/xml.test.ts src/inbound-appmsg.test.ts src/send-rich-message.test.ts`

Expected: FAIL until文档与回归覆盖完整

**Step 3: Write minimal implementation**

- 在 `README.md` 的“富消息与消息复用”段落补充：
  - 入站引用消息支持
  - 新增上下文字段说明
  - `quoteReply` 结构与 `replyToId` 自动桥接规则

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/xml.test.ts src/inbound-appmsg.test.ts src/send-rich-message.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add README.md src/xml.test.ts src/inbound-appmsg.test.ts src/send-rich-message.test.ts
git commit -m "docs: document GeWe quote message support"
```

import assert from "node:assert/strict";
import test from "node:test";

import { extractQuoteDetails, extractQuoteSummary } from "./xml.ts";

test("extractQuoteDetails 会解析 type=57 引用消息", () => {
  const xml = [
    "<msg>",
    "<appmsg>",
    "<type>57</type>",
    "<title>回复内容</title>",
    "<refermsg>",
    "<type>1</type>",
    "<svrid>123</svrid>",
    "<fromusr>wxid_a</fromusr>",
    "<displayname>张三</displayname>",
    "<content>原始文本</content>",
    "</refermsg>",
    "</appmsg>",
    "</msg>",
  ].join("");

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
  const xml = [
    "<msg>",
    "<appmsg>",
    "<type>57</type>",
    "<title>回复内容</title>",
    "<refermsg>",
    "<type>1</type>",
    "<content>原始文本</content>",
    "</refermsg>",
    "</appmsg>",
    "</msg>",
  ].join("");

  assert.deepEqual(extractQuoteSummary(xml), {
    body: "[引用:文本] 原始文本\n回复内容",
    quoteLabel: "文本",
  });
});

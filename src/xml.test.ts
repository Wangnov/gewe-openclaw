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

test("extractQuoteDetails 会解析部分引用元数据", () => {
  const xml = [
    "<msg>",
    "<appmsg>",
    "<type>57</type>",
    "<title>本消息为引用消息</title>",
    "<refermsg>",
    "<partialtext>",
    "<start><![CDATA[你]]></start>",
    "<end><![CDATA[啊]]></end>",
    "<startindex>0</startindex>",
    "<endindex>0</endindex>",
    "<quotemd5>124756ef340daf80196b4124686d651c</quotemd5>",
    "</partialtext>",
    "<type>1</type>",
    "<svrid>3464478223924169609</svrid>",
    "<content>我这是一句完整的话，但我只需要引用你好啊三个字</content>",
    "</refermsg>",
    "</appmsg>",
    "</msg>",
  ].join("");

  assert.deepEqual(extractQuoteDetails(xml), {
    title: "本消息为引用消息",
    referType: 1,
    svrid: "3464478223924169609",
    content: "我这是一句完整的话，但我只需要引用你好啊三个字",
    partialText: {
      start: "你",
      end: "啊",
      startIndex: 0,
      endIndex: 0,
      quoteMd5: "124756ef340daf80196b4124686d651c",
      text: "你好啊",
    },
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

test("extractQuoteSummary 会优先展示部分引用片段", () => {
  const xml = [
    "<msg>",
    "<appmsg>",
    "<type>57</type>",
    "<title>本消息为引用消息</title>",
    "<refermsg>",
    "<partialtext>",
    "<start><![CDATA[你]]></start>",
    "<end><![CDATA[啊]]></end>",
    "<startindex>0</startindex>",
    "<endindex>0</endindex>",
    "<quotemd5>124756ef340daf80196b4124686d651c</quotemd5>",
    "</partialtext>",
    "<type>1</type>",
    "<content>我这是一句完整的话，但我只需要引用你好啊三个字</content>",
    "</refermsg>",
    "</appmsg>",
    "</msg>",
  ].join("");

  assert.deepEqual(extractQuoteSummary(xml), {
    body: "[引用:文本] 你好啊\n本消息为引用消息",
    quoteLabel: "文本",
  });
});

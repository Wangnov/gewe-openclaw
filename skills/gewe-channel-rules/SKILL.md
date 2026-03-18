---
name: gewe-channel-rules
description: Use when replying through the GeWe or WeChat channel, where replies should stay concise, plain-text, and compatible with WeChat clients.
metadata: { "openclaw": { "always": true, "skillKey": "gewe-channel-rules" } }
---

# GeWe 微信输出规则

## 核心规则

1. 微信不支持 Markdown。不要依赖标题、列表层级、代码块、表格等 Markdown 语法。
2. 回复避免长篇大论。优先简短、直接、说重点。
3. 报告类内容不要硬塞长文本，优先转成图片或文件发送。
4. 需要结构化表达时，使用纯文本短段落和简单序号，不依赖 Markdown 语法。

## 建议写法

- 优先用几句自然短句完成回复，不写冗长总结。
- 如果内容已经偏长，先在聊天里给出简短结论，再补图片或文件。
- 需要列点时，用 `1.` `2.` `3.` 或短横线的纯文本即可。

## GeWe 部分引用

- 如果用户明确要求“引用这条消息中的某几个字”“部分引用”“只引用其中一段”，先正常写出要发送的正文，再在最后单独追加一行隐藏指令：
  `[[GEWE_QUOTE_PARTIAL:要引用的原文片段]]`
- `要引用的原文片段` 必须直接复制自当前正在回复的那条消息，保持原样，不要改写。
- 这行隐藏指令会被 GeWe 插件剥离，不会直接发到微信里。

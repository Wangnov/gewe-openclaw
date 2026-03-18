# GeWe 自动引用回复配置设计

**目标**

为 `gewe-openclaw` 增加一个可选配置项，允许用户关闭“纯文本 + replyToId 自动转引用回复”的默认行为，同时保持显式 `quoteReply` 能力不受影响。

**现状**

- 当前插件会在 `payload.text + payload.replyToId + 无媒体` 时自动发送 GeWe `type=57` 引用消息。
- 这个行为没有配置开关。
- 显式 `channelData["gewe-openclaw"].quoteReply` 已独立存在，且优先级高于自动桥接。

**方案**

采用最小布尔配置：

```json
{
  "channels": {
    "gewe-openclaw": {
      "autoQuoteReply": true
    }
  }
}
```

- `true` 或未配置：保持当前行为，兼容存量用户。
- `false`：关闭自动桥接；普通 `replyToId + text` 改回发送普通文本。
- 显式 `quoteReply`、显式 `partialText`、以及已有引用上下文复用逻辑全部保留。

**影响范围**

- `src/types.ts`：声明配置类型。
- `src/config-schema.ts`：加入 schema。
- `src/delivery.ts`：在自动引用分支读取配置开关。
- `src/send-rich-message.test.ts`：覆盖关闭开关后的行为。
- `README.md`：补充配置说明。

**兼容性**

这是向后兼容变更。默认值保持 `true`，不会改变现有安装的行为；只有显式配置 `false` 才关闭自动引用。

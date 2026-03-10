# GeWe Block Streaming Design

**背景**

当前 GeWe 通道在入站回复时只调用了 buffered dispatcher 的 `deliver` 路径，没有把 GeWe 通道自己的 block streaming 意图传给核心 replyOptions，因此 AI 中间生成出的 block 内容不会提前发出，而是更容易积压到 final 阶段一起发送。

**目标**

让 GeWe 通道真正启用 OpenClaw 已有的 `blockStreaming` 机制，但暂时不接 `onPartialReply`，也不做群聊节流。用户应当看到按 block 分段逐步发出的微信消息，而不是 token 级刷屏，也不是等到结束一次性全部发出。

**方案**

1. 在 GeWe 插件侧新增一个很小的 reply-options helper，统一解析 GeWe 的 block streaming 开关。
2. 默认行为设为开启 block streaming；只有当 `channels.gewe-openclaw.blockStreaming=false` 时才显式关闭。
3. 在入站分发调用 `dispatchReplyWithBufferedBlockDispatcher(...)` 时，把 `replyOptions.disableBlockStreaming` 传进去。
4. 保持现有 `deliverGewePayload(...)` 发送逻辑不变，这样 GeWe 只会消费核心稳定下来的 block/final 结果，不会消费 token 级 partial 快照。

**非目标**

- 不实现 `onPartialReply`
- 不实现群聊节流器
- 不改发送 API，不尝试消息更新/编辑

**预期效果**

- 私聊和群聊都能看到 block 级逐步回复
- 不会出现每个 partial 快照都发一条微信消息
- final 阶段仍保留现有发送链路作为收尾

# GeWe OpenClaw Plugin

基于 GeWe API + Webhook 回调的 OpenClaw 微信通道插件。

## 安装

### 从 npm 安装

```bash
openclaw plugins install gewe-openclaw
```

### 从本地目录安装

```bash
openclaw plugins install /path/to/gewe-openclaw
```

或使用软链接（便于开发调试）：

```bash
openclaw plugins install --link /path/to/gewe-openclaw
```

### 从归档安装

OpenClaw 支持本地 `.zip` / `.tgz` / `.tar.gz` / `.tar` 归档：

```bash
openclaw plugins install ./gewe-openclaw.tgz
```

> 安装或启用插件后需要重启 Gateway。

## 配置方式（二选一）

安装完成后可任选一种方式完成配置：

### 方式 A：Onboarding 向导

```bash
openclaw onboard
```

在通道列表中选择 **GeWe**，按提示填写 `token`、`appId`、`webhook`，以及可选的 `mediaPublicUrl`/`S3` 媒体配置。

如果你使用 `gewe-gateway` 网关模式，则改为填写 `gatewayUrl`、`gatewayKey`、`gatewayInstanceId`、`webhookPublicUrl` 和显式群列表。

### 方式 B：直接编辑配置文件

直接编辑 `~/.openclaw/openclaw.json` 的 `channels.gewe-openclaw` 段落（见下方示例）。

## 配置

插件配置放在 `~/.openclaw/openclaw.json` 的 `channels.gewe-openclaw`，并确保通道开启（示例仅保留必填/常用字段）：

```json5
{
  "channels": {
    "gewe-openclaw": {
      "enabled": true,
      "token": "<gewe-token>",
      "appId": "<gewe-app-id>",
      "webhookHost": "0.0.0.0",
      "webhookPort": 4399,
      "webhookPath": "/webhook",
      "mediaHost": "0.0.0.0",
      "mediaPort": 4400,
      "mediaPath": "/gewe-media",
      "mediaPublicUrl": "https://your-public-domain/gewe-media",
      "s3Enabled": true,
      "s3Endpoint": "https://s3.amazonaws.com",
      "s3Region": "us-east-1",
      "s3Bucket": "your-bucket",
      "s3AccessKeyId": "<access-key-id>",
      "s3SecretAccessKey": "<secret-access-key>",
      "s3UrlMode": "public",
      "s3PublicBaseUrl": "https://cdn.example.com/gewe-media",
      "s3KeyPrefix": "gewe-openclaw/outbound",
      "allowFrom": ["wxid_xxx"]
    }
  }
}
```

完整参数说明：
- `webhookHost/webhookPort/webhookPath`：GeWe 回调入口（需公网可达，常配合 FRP）。
- `mediaPath`：本地媒体服务的路由前缀（默认 `/gewe-media`）。
- `mediaPublicUrl`：本地反代回退时的公网地址前缀（可选）。配置后会自动拼接媒体 ID；通常应与 `mediaPath` 对齐。
- `s3Enabled`：是否启用 S3 兼容上传。
- `s3Endpoint/s3Region/s3Bucket/s3AccessKeyId/s3SecretAccessKey`：S3 兼容服务连接参数。
- `s3SessionToken`：临时凭证可选字段。
- `s3ForcePathStyle`：是否启用 path-style（部分 S3 兼容服务需要）。
- `s3UrlMode`：`public` 或 `presigned`（默认 `public`）。
- `s3PublicBaseUrl`：`public` 模式下用于拼接可访问 URL（必填）。
- `s3PresignExpiresSec`：`presigned` 模式签名有效期（默认 3600 秒）。
- `s3KeyPrefix`：对象 key 前缀（默认 `gewe-openclaw/outbound`）。
- `allowFrom`：允许私聊触发的微信 ID（或在群里走 allowlist 规则）。
- `voiceAutoConvert`：自动将音频转为 silk（默认开启；设为 `false` 可关闭）。
- `silkAutoDownload`：自动下载 `rust-silk`（默认开启；可关闭后自行配置 `voiceSilkPath` / `voiceDecodePath`）。
- `silkVersion`：自动下载的 `rust-silk` 版本（`latest` 会自动清理旧版本）。
- `silkBaseUrl`：自定义下载源（默认 GitHub Releases）。
- `silkInstallDir`：自定义安装目录（默认 `~/.openclaw/tools/rust-silk/<version>`）。
- `silkAllowUnverified`：校验文件缺失时是否允许继续（默认 `false`）。
- `silkSha256`：手动指定下载包 SHA256（用于私有源或校验文件缺失场景）。
 - `apiBaseUrl`：GeWe API 地址（默认 `https://www.geweapi.com`）。
 - `voiceFfmpegPath`/`videoFfmpegPath`/`videoFfprobePath`：自定义 ffmpeg/ffprobe 路径。
 - `voiceSilkPath`/`voiceSilkArgs`：自定义 silk 编码器路径和参数（不使用自动下载时）。
 - `voiceSilkPipe`：是否启用 ffmpeg+rust-silk 的 stdin/stdout 管道（默认关闭；失败会回退到临时文件）。
   - 低频/非高并发且磁盘压力不高时，推荐临时文件方案（更稳定/更快）。
   - 高频/多并发或磁盘压力大时，推荐 pipe 方案（减少磁盘 IO）。
 - `voiceDecodePath`/`voiceDecodeArgs`/`voiceDecodeOutput`：自定义 silk 解码器（入站语音转写用）。
 - `mediaMaxMb`：上传媒体大小上限（默认 20MB）。
 - `downloadMinDelayMs`/`downloadMaxDelayMs`：入站媒体下载节流。

发送媒体时的 URL 策略：
- 本地文件：优先上传 S3，失败回退 `mediaPublicUrl` 本地反代。
- 公网 URL：先尝试原 URL 发送，失败后再尝试上传 S3，仍失败回退本地反代。

> 配置变更后需重启 Gateway。

## 网关模式

当你没有足够多的微信号，但希望让多台 OpenClaw 临时分别服务不同微信群时，可以把 `gewe-openclaw` 配成网关模式。

网关模式下：

- GeWe 官方 webhook 只打到 `gewe-gateway`
- `gewe-openclaw` 不再直连 GeWe，也不再要求本地配置 `token/appId`
- 每台 OpenClaw 只声明自己负责的群
- 网关按群转发入站消息，并统一代理所有出站请求

最小配置示例：

```json5
{
  "channels": {
    "gewe-openclaw": {
      "enabled": true,
      "gatewayUrl": "https://your-gateway.example.com",
      "gatewayKey": "<gateway-key>",
      "gatewayInstanceId": "openclaw-demo-a",
      "webhookPublicUrl": "https://your-openclaw.example.com/gewe/webhook",
      "webhookSecret": "<callback-secret>",
      "groups": {
        "123456@chatroom": {
          "enabled": true,
          "requireMention": true
        }
      }
    }
  }
}
```

网关模式注意事项：

- `gatewayUrl` 和 `gatewayKey` 必须成对配置
- 一旦进入网关模式，`apiBaseUrl` 会被忽略
- `groups` 必须显式列出群 ID，不能用 `*`
- `webhookPublicUrl` 必须是网关可访问到的完整回调地址
- 一个群同一时间只能绑定到一个活跃 OpenClaw 实例

## 高级用法：让未安装插件也出现在 onboarding 列表

默认情况下，**只有已安装的插件**会出现在 onboarding 列表中。  
如果你希望“未安装时也能在列表中展示”，需要配置本地 catalog：

```
~/.openclaw/plugins/catalog.json
```

示例（添加一次即可）：

```json
{
  "entries": [
    {
      "name": "gewe-openclaw",
      "openclaw": {
        "channel": {
          "id": "gewe-openclaw",
          "label": "GeWe",
          "selectionLabel": "WeChat (GeWe)",
          "detailLabel": "WeChat (GeWe)",
          "docsPath": "/channels/gewe-openclaw",
          "docsLabel": "gewe-openclaw",
          "blurb": "WeChat channel via GeWe API and webhook callbacks.",
          "aliases": ["gewe-openclaw", "gewe", "wechat", "wx"],
          "order": 72,
          "quickstartAllowFrom": true
        },
        "install": {
          "npmSpec": "gewe-openclaw",
          "defaultChoice": "npm"
        }
      }
    }
  ]
}
```

> 现在插件已支持 onboarding：选择 GeWe 通道后会提示填写 token/appId/webhook/mediaPublicUrl 等配置。

## 依赖

### npm 依赖

- `zod`

### peer 依赖

- `openclaw` (>= 2026.1.29)

### 系统级工具

- `ffmpeg` / `ffprobe`（用于视频缩略图与时长）
- `rust-silk`（出站语音转 silk + 入站语音解码；支持自动下载）
- 或者自行安装 `silk-encoder` / `silk-decoder` 并在配置中指定路径

### 网络/服务依赖

- GeWe API 服务
- Webhook 回调需要公网可达（可配合 FRP）
- 媒体对外地址（`mediaPublicUrl`）

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

## 配置

插件配置放在 `~/.openclaw/openclaw.json` 的 `channels.gewe-openclaw`，并确保插件开启：

```json5
{
  "plugins": {
    "entries": {
      "gewe-openclaw": { "enabled": true }
    }
  },
  "channels": {
    "gewe-openclaw": {
      "enabled": true,
      "apiBaseUrl": "https://www.geweapi.com",
      "token": "<gewe-token>",
      "appId": "<gewe-app-id>",
      "webhookHost": "0.0.0.0",
      "webhookPort": 4399,
      "webhookPath": "/webhook",
      "mediaHost": "0.0.0.0",
      "mediaPort": 4400,
      "mediaPath": "/gewe-media",
      "mediaPublicUrl": "https://your-public-domain/gewe-media",
      "allowFrom": ["wxid_xxx"],
      "silkAutoDownload": true,
      "silkVersion": "latest",
      "silkBaseUrl": "https://github.com/Wangnov/rust-silk/releases/download",
      "silkInstallDir": "~/.openclaw/tools/rust-silk",
      "silkAllowUnverified": false
    }
  }
}
```

说明：
- `webhookHost/webhookPort/webhookPath`：GeWe 回调入口（需公网可达，常配合 FRP）。
- `mediaPath`：本地媒体服务的路由前缀（默认 `/gewe-media`）。
- `mediaPublicUrl`：公网访问地址的“基础前缀”，会自动拼接媒体 ID。通常应与 `mediaPath` 对齐，例如 `mediaPath="/gewe-media"` 时，`mediaPublicUrl` 也应包含 `/gewe-media`。
- `allowFrom`：允许私聊触发的微信 ID（或在群里走 allowlist 规则）。
- `voiceAutoConvert`：自动将音频转为 silk（默认开启；设为 `false` 可关闭）。
- `silkAutoDownload`：自动下载 `rust-silk`（默认开启；可关闭后自行配置 `voiceSilkPath` / `voiceDecodePath`）。
- `silkVersion`：自动下载的 `rust-silk` 版本（`latest` 会自动清理旧版本）。
- `silkBaseUrl`：自定义下载源（默认 GitHub Releases）。
- `silkInstallDir`：自定义安装目录（默认 `~/.openclaw/tools/rust-silk/<version>`）。
- `silkAllowUnverified`：校验文件缺失时是否允许继续（默认 `false`）。
- `silkSha256`：手动指定下载包 SHA256（用于私有源或校验文件缺失场景）。

> 配置变更后需重启 Gateway。

## 在 onboarding 列表中显示（可选）

OpenClaw 支持外部插件目录（catalog）。放置到以下路径即可被 onboarding 读取：

```
~/.openclaw/plugins/catalog.json
```

示例（只需添加一次）：

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

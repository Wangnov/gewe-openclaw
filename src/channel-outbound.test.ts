import assert from "node:assert/strict";
import test from "node:test";

import { gewePlugin } from "./channel.ts";

test("GeWe outbound 暴露默认 textChunkLimit 供宿主应用 chunk 配置", () => {
  assert.equal(gewePlugin.outbound?.textChunkLimit, 4000);
  assert.equal(gewePlugin.outbound?.chunkerMode, "markdown");
});

test("GeWe outbound 会为 audioAsVoice 媒体补上 channelData 以保留语音发送语义", () => {
  const normalized = gewePlugin.outbound?.normalizePayload?.({
    payload: {
      text: "caption",
      mediaUrl: "/tmp/voice.wav",
      audioAsVoice: true,
    },
  });

  assert.deepEqual(normalized, {
    text: "caption",
    mediaUrl: "/tmp/voice.wav",
    audioAsVoice: true,
    channelData: {
      "gewe-openclaw": {
        audioAsVoice: true,
      },
    },
  });
});

test("GeWe outbound 不会为多媒体 audioAsVoice payload 强行改走 sendPayload", () => {
  const payload = {
    text: "caption",
    mediaUrls: ["/tmp/voice.wav", "/tmp/extra.png"],
    audioAsVoice: true,
  };

  const normalized = gewePlugin.outbound?.normalizePayload?.({ payload });

  assert.equal(normalized, payload);
});

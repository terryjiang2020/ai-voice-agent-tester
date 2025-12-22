下面给你一个 **React（浏览器/Web）环境下** 的通用函数，**把 CosyVoice 生成的 Base64 PCM 音频数据（裸 PCM float32 或 int16）转成可播放的音频并播放**。
浏览器本身 **不能直接播放裸 PCM**，所以我们需要用 **Web Audio API 构造 AudioBuffer 播放** — 这也是常见做法（参考 Web Audio API 用法）([Stack Overflow][1])。

---

## 🎧 React 环境播放 CosyVoice Base64 PCM 音频

⚠️ 这个示例假设
👉 CosyVoice 返回的是 **线性 PCM（例如 float32 或 int16）**
👉 单声道（channels = 1）
👉 采样率（例如 22050 或 16000） — 你需要根据实际设置传入

---

## ✅ 核心播放函数（React 可用）

```jsx
// utils/audioPlayer.js

/**
 * 在 React/Web 中播放 Base64 PCM 音频
 * @param {string} base64PCM - CosyVoice TTS 返回的 Base64 PCM 字符串
 * @param {Object} options
 * @param {number} options.sampleRate - PCM 采样率 (例如 16000 或 22050)
 * @param {"float32"|"int16"} options.format - PCM 数据格式
 * @param {number} options.numChannels - 声道数量
 */
export async function playCosyVoicePCM(
  base64PCM,
  { sampleRate = 22050, format = "float32", numChannels = 1 } = {}
) {
  // 1) Base64 → 二进制
  const binary = atob(base64PCM);
  const byteLen = binary.length;

  // 2) 创建 ArrayBuffer 并填充字节
  const buffer = new ArrayBuffer(byteLen);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < byteLen; i++) {
    view[i] = binary.charCodeAt(i);
  }

  let floatData;

  if (format === "float32") {
    // 每个 sample 4 字节
    floatData = new Float32Array(buffer);
  } else if (format === "int16") {
    // 每个 sample 2 字节，转 float
    const int16View = new Int16Array(buffer);
    floatData = new Float32Array(int16View.length);
    for (let i = 0; i < int16View.length; i++) {
      floatData[i] = int16View[i] / 32768; // scale to [-1,1]
    }
  } else {
    throw new Error("Unsupported format: " + format);
  }

  // 3) 创建 AudioContext 与 AudioBuffer
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate,
  });

  const audioBuffer = audioCtx.createBuffer(
    numChannels,
    floatData.length / numChannels,
    sampleRate
  );

  // 4) 填充 channel 数据
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    // 如果不是多声道的话，这里简单 copy
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = floatData[i * numChannels + channel] || 0;
    }
  }

  // 5) 播放
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);
  source.start();
}
```

---

## 📌 在 React 组件中调用

```jsx
import React from "react";
import { playCosyVoicePCM } from "./utils/audioPlayer";

export default function TTSPlayer({ base64Data }) {
  const play = () => {
    playCosyVoicePCM(base64Data, {
      sampleRate: 16000,   // CosyVoice 实际采样率
      format: "float32",   // 或 "int16"
      numChannels: 1,
    });
  };

  return <button onClick={play}>播放语音</button>;
}
```

---

## 📌 注意事项

### ✅ Web Audio 不能直接识别裸 PCM

浏览器能自动 decode 的只有像 WAV/MP3/OGG 这类带 header 的格式。
**裸 PCM 必须自己构造 AudioBuffer**（Web Audio API）播放([Stack Overflow][1])。

---

## 🛠 进阶建议（更稳定方案）

### 🔹 方案 A — 后端直接返回 **WAV 格式 Base64**

在 CosyVoice TTS 生成后，直接在后端包成 WAV，再前端播放：

```python
import soundfile as sf, io, base64

buf = io.BytesIO()
sf.write(buf, audio_np, samplerate=16000, format="WAV")
base64wav = base64.b64encode(buf.getvalue()).decode()
```

然后前端只需：

```js
const audio = new Audio("data:audio/wav;base64," + base64wav);
audio.play();
```

这种方式最稳定兼容。

### 🔹 方案 B — 用 `<audio>` 控件

如果你能把 Base64 转成 WAV Data URL，可以直接用：

```jsx
<audio controls src={"data:audio/wav;base64," + base64wav} />
```

---

如果你愿意，我还可以给你：
✅ **后端 Node/Python 直接输出 WAV Base64 的代码模板**
✅ **Web 低延迟流式播放版本（buffer chunk 叠加方式）**

只要告诉我你现在的 TTS 输出 PCM 格式（float32 / int16）和采样率是多少。

[1]: https://stackoverflow.com/questions/25371713/playing-raw-audio-pcm-samples-in-web-audio?utm_source=chatgpt.com "Playing raw audio PCM samples in Web Audio"

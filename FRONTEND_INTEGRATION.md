# Frontend Integration Guide

## Base URL
```
Production: https://devserver.elasticdash.com
Local Dev:  http://localhost:8000
```

## API Overview

The Voice Assistant Backend provides REST APIs for voice interactions.

### Backend TTS Integration (Internal)

The TTS service communicates with CosyVoice via HTTP:
1. **CosyVoice** runs as FastAPI service: `uvicorn stream_service:app --port 50000`
2. **Our backend** internally calls `POST /synthesize` on CosyVoice
3. **Protocol**: Streaming raw audio bytes
  - Request: `POST /synthesize` with `{"text": "...", "speaker": "..."}`
  - Response: streaming `application/octet-stream` of audio bytes

Note: `/synthesize` belongs to the CosyVoice service and is NOT exposed by this backend. Frontend should only call the backend REST APIs under `/api/...` and never call `/synthesize` directly.

---

## 1. REST API Endpoints
### 1.6 Unified Streaming (Audio In; Audio + Text Out)
**POST** `/api/voice/stream`

Send raw audio as `application/octet-stream` and receive a streaming response of NDJSON frames.

**Response Content-Type**: `application/x-ndjson`

**Frame Types:**
```json
{"type": "asr", "text": "最终转录文本"}
{"type": "llm", "text": "部分文字", "partial": true}
{"type": "llm", "text": "完整文字", "partial": false}
{"type": "tts", "audio": "base64_audio_chunk"}
{"type": "done"}
{"type": "error", "message": "错误描述"}
```

**Frontend Usage (simplified):**
```javascript
async function voiceStream(audioBuffer) {
  const url = 'https://devserver.elasticdash.com/api/voice/stream';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: audioBuffer, // ArrayBuffer or Uint8Array
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const frame = JSON.parse(line);
      switch (frame.type) {
        case 'asr':
          // Show transcribed text
          break;
        case 'llm':
          // Append partial text; replace with final when partial=false
          break;
        case 'tts':
          // Queue base64 audio chunk for later playback
          audioQueue.append(frame.audio);
          break;
        case 'done':
          // End of stream
          // Assemble queued audio into WAV and play
          const wavBlob = audioQueue.finalizeWav({ sampleRate: 16000 });
          const url = URL.createObjectURL(wavBlob);
          const audio = new Audio(url);
          audio.play();
          break;
        case 'error':
          console.error('Stream error:', frame.message);
          break;
      }
    }
  }
}

// Helper: queue base64 PCM chunks and assemble WAV
class PcmAudioQueue {
  constructor() {
    this.chunks = [];
  }
  append(base64Chunk) {
    this.chunks.push(base64Chunk);
  }
  finalizeWav({ sampleRate = 16000 }) {
    // Concatenate PCM bytes
    const pcmBytes = this._concatBase64(this.chunks);
    // Create WAV header for 16-bit mono PCM
    const wavBytes = this._encodeWav(pcmBytes, sampleRate);
    return new Blob([wavBytes], { type: 'audio/wav' });
  }
  _concatBase64(base64List) {
    const totalLength = base64List.reduce((sum, b64) => sum + atob(b64).length, 0);
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const b64 of base64List) {
      const bin = atob(b64);
      for (let i = 0; i < bin.length; i++) out[offset++] = bin.charCodeAt(i);
    }
    return out.buffer;
  }
  _encodeWav(pcmArrayBuffer, sampleRate) {
    const numChannels = 1;
    const bytesPerSample = 2; // 16-bit PCM
    const pcm = new Uint8Array(pcmArrayBuffer);
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcm.byteLength;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this._writeString(view, 8, 'WAVE');

    // fmt chunk
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // PCM
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 8 * bytesPerSample, true); // bits per sample

    // data chunk
    this._writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // PCM data
    const out = new Uint8Array(buffer, 44);
    out.set(pcm);
    return buffer;
  }
  _writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}

// Instantiate a global queue in your component/module
const audioQueue = new PcmAudioQueue();
```

Notes:
- The example assembles a single WAV at the end (`type=done`) for simplicity. For true continuous playback, consider using `AudioWorklet` or `ScriptProcessorNode` to feed PCM frames directly.
- Assumes 16 kHz, mono, 16-bit PCM. Adjust `sampleRate` if your backend emits a different rate.

### 1.7 Realtime WebSocket (Audio In; Incremental Events Out)
**WS** `/ws/voice/stream`

- Send: binary frames of 16 kHz mono 16-bit PCM (small chunks, e.g., 20–100 ms)
- Receive: JSON events (text frames)
- Event types: `speech_started`, `speech_stopped`, `asr.partial`, `asr.final`, `llm.partial`, `llm.final`, `tts.chunk` (base64 PCM16), `done`, `error`, `heartbeat`

Minimal client outline:
```javascript
const ws = new WebSocket('wss://devserver.elasticdash.com/ws/voice/stream');
ws.binaryType = 'arraybuffer';

ws.onmessage = (evt) => {
  const msg = JSON.parse(evt.data);
  switch (msg.type) {
    case 'asr.partial':
    case 'asr.final':
      console.log('ASR', msg.text);
      break;
    case 'llm.partial':
    case 'llm.final':
      console.log('LLM', msg.text);
      break;
    case 'tts.chunk':
      // push base64 PCM into AudioWorklet for low-latency playback
      break;
    case 'done':
      console.log('Turn complete');
      break;
    case 'error':
      console.error(msg.message);
      break;
  }
};

// Send PCM chunk (ArrayBuffer) captured from mic at 16kHz mono
// ws.send(pcmChunkBuffer);

// Optional: tell server to finalize current turn
// ws.send('stop');
```

Playback: reuse the AudioWorklet example in this doc to stream `tts.chunk` frames (base64 PCM16) into the worklet for continuous audio. For a quick test, you can collect `tts.chunk` frames, wrap a WAV header, and play once finished.

### Continuous Playback (low-latency) with AudioWorklet

Below is a minimal pattern to play PCM frames as they arrive. You need two small files:

`public/pcm-player-processor.js`
```javascript
class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'pcm') {
        this.queue.push(event.data.samples);
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];
    if (this.queue.length === 0) {
      channel.fill(0);
      return true;
    }
    const samples = this.queue.shift();
    const len = Math.min(channel.length, samples.length);
    for (let i = 0; i < len; i++) {
      channel[i] = samples[i];
    }
    // If fewer samples than buffer, pad with zeros
    for (let i = len; i < channel.length; i++) channel[i] = 0;
    return true;
  }
}

registerProcessor('pcm-player-processor', PcmPlayerProcessor);
```

Frontend usage (outline):
```javascript
async function setupPcmPlayer(sampleRate = 16000) {
  const audioContext = new AudioContext({ sampleRate });
  await audioContext.audioWorklet.addModule('/pcm-player-processor.js');
  const node = new AudioWorkletNode(audioContext, 'pcm-player-processor');
  node.connect(audioContext.destination);
  return {
    pushPcm(int16PcmSamples) {
      // Convert Int16Array to Float32 [-1, 1]
      const f32 = new Float32Array(int16PcmSamples.length);
      for (let i = 0; i < int16PcmSamples.length; i++) {
        f32[i] = int16PcmSamples[i] / 32768;
      }
      node.port.postMessage({ type: 'pcm', samples: f32 });
    },
    context: audioContext,
  };
}

function base64PcmToInt16(base64) {
  const bin = atob(base64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return new Int16Array(buf);
}

// In your streaming handler:
// const player = await setupPcmPlayer(16000);
// when frame.type === 'tts':
//   const pcm = base64PcmToInt16(frame.audio);
//   player.pushPcm(pcm);
```

Latency tips:
- Keep chunks modest (e.g., 256–2048 samples) to reduce delay; backend can emit small PCM slices.
- Trigger TTS after sentence-end punctuation to respond promptly at pauses.
- Resume recording after playback starts if doing turn-based interaction; for barge-in, consider VAD/client logic.

### 1.1 Root Endpoint
**GET** `/`

Returns API metadata and available endpoints.

**Response:**
```json
{
  "message": "Voice Assistant Backend API",
  "version": "1.0.0",
  "endpoints": {
    "health": "/health",
    "api": {
      "voice": "/api/voice",
      "asr": "/api/asr",
      "llm": "/api/llm",
      "tts": "/api/tts"
    }
  }
}
```

---

### 1.2 Health Check
**GET** `/health`

Check service availability and status.

**Response:**
```json
{
  "status": "healthy",  // or "degraded"
  "services": {
    "asr": true,
    "llama": true,
    "tts": true
  }
}
```

**Frontend Usage:**
```javascript
async function checkHealth() {
  const response = await fetch('https://devserver.elasticdash.com/health');
  const data = await response.json();
  
  if (data.status === 'healthy') {
    console.log('All services operational');
  } else {
    console.warn('Some services degraded:', data.services);
  }
}
```

---

### 1.3 ASR (Speech-to-Text)
**POST** `/api/asr`

Convert audio to text. Accepts both raw PCM and WAV files.

**Request:**
```json
{
  "audio_data": "base64_encoded_audio_string"
}
```

**Response:**
```json
{
  "text": "转录的文字内容",
  "success": true
}
```

**Frontend Usage:**
```javascript
async function transcribeAudio(audioBlob) {
  // Convert audio to base64
  const reader = new FileReader();
  reader.readAsDataURL(audioBlob);
  
  const base64Audio = await new Promise((resolve) => {
    reader.onloadend = () => {
      // Remove data:audio/xxx;base64, prefix
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
  });
  
  const response = await fetch('https://devserver.elasticdash.com/api/asr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_data: base64Audio
    })
  });
  
  const data = await response.json();
  return data.text;
}
```

**Notes:**
- Accepts WAV files (header is automatically stripped) or raw PCM
- Best results with 16 kHz, mono, 16-bit PCM
- For streaming endpoint, send raw bytes with `Content-Type: application/octet-stream`

---

### 1.4 LLM (Text Generation)
**POST** `/api/llm`

Generate text response using LLM.

**Request:**
```json
{
  "messages": [
    {"role": "user", "content": "你好"},
    {"role": "assistant", "content": "你好！有什么可以帮助你的吗？"},
    {"role": "user", "content": "介绍一下你自己"}
  ],
  "temperature": 0.7,
  "max_tokens": 2000
}
```

**Response:**
```json
{
  "content": "LLM生成的回复内容",
  "success": true
}
```

**Frontend Usage:**
```javascript
async function getLLMResponse(messages) {
  const response = await fetch('https://devserver.elasticdash.com/api/llm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: messages,
      temperature: 0.7,
      max_tokens: 2000
    })
  });
  
  const data = await response.json();
  return data.content;
}
```

---

### 1.5 TTS (Text-to-Speech)
**POST** `/api/tts`

Convert text to speech audio.

**Request:**
```json
{
  "text": "要转换为语音的文字",
  "speaker": "中文女"  // optional
}
```

**Response:**
```json
{
  "audio_data": "base64_encoded_audio_bytes",
  "success": true
}
```

**Frontend Usage:**
```javascript
async function textToSpeech(text, speaker = '中文女') {
  const response = await fetch('https://devserver.elasticdash.com/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      speaker: speaker
    })
  });
  
  const data = await response.json();
  
  // Convert base64 to audio blob
  const audioBlob = base64ToBlob(data.audio_data, 'audio/wav');
  const audioUrl = URL.createObjectURL(audioBlob);
  
  // Play audio
  const audio = new Audio(audioUrl);
  audio.play();
  
  return audioUrl;
}

function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}
```

---


---

## 4. Error Handling

### HTTP Errors
```javascript
async function callAPI(endpoint, body) {
  try {
    const response = await fetch(`https://devserver.elasticdash.com${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}
```


---

## 5. CORS Configuration

The backend is configured with permissive CORS for development:
```python
allow_origins=["*"]
allow_credentials=True
allow_methods=["*"]
allow_headers=["*"]
```

For production, you may want to restrict origins to your frontend domain.

---

## 6. Audio Format Requirements

- **Sample Rate**: 16000 Hz
- **Channels**: Mono
- **Format**: PCM/WAV preferred
- **Encoding**: Raw binary or base64 for REST API

---

## 7. Troubleshooting

### Issue: API call fails
- Check if backend is running: `curl https://devserver.elasticdash.com/health`
- Verify endpoint paths and HTTP methods
- Check browser console for CORS or certificate errors

### Issue: Audio not playing
- Ensure AudioContext is created after user interaction (browser policy)
- Check audio format compatibility
- Verify base64 decoding is correct

### Issue: ASR returns empty text
- Verify audio format (16kHz, mono, 16-bit PCM)
- WAV files are now automatically handled (header stripped)
- Check that audio contains actual speech (not silence)
- Ensure audio duration is at least 0.5-1 second
- Model is optimized for Chinese; other languages may produce poor results

---

## 8. Rate Limiting & Best Practices

1. **Debounce audio chunks**: Don't send every tiny audio fragment
2. **Handle backpressure**: Check `ws.bufferedAmount` before sending
3. **Cleanup resources**: Close AudioContext and MediaRecorder when done
4. **Monitor connection**: Implement heartbeat/ping every 30s
5. **Cache health checks**: Don't poll `/health` too frequently

---

## Support

For issues or questions:
- Backend Repository: https://github.com/ElasticDash-Official/voice-assistant-backend
- Production API: https://devserver.elasticdash.com

---

**Last Updated**: 2025-12-21

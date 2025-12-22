# CosyVoice API Audio Format Guide

## 📋 Overview

The CosyVoice TTS API returns audio in **raw Float32 PCM format** for streaming responses. This document explains how to properly handle the audio data.

---

## 🎵 Audio Format Specifications

| Property | Value |
|----------|-------|
| **Format** | Float32 PCM (raw binary) |
| **Sample Rate** | 24,000 Hz (24 kHz) |
| **Channels** | 1 (Mono) |
| **Bit Depth** | 32-bit floating point |
| **Sample Range** | -1.0 to +1.0 |
| **Byte Order** | Little-endian |

---

## 🔄 Processing Pipeline

### 1. API Response Format

The `/synthesize` endpoint returns:
- **Content-Type**: `application/octet-stream`
- **Data**: Raw Float32 PCM bytes (no WAV header)
- **Encoding**: Each sample is 4 bytes (32-bit float)

### 2. Client-Side Processing Steps

#### Step 1: Receive Base64 Data
```javascript
// Example: Receive from API
const response = await fetch('/synthesize', { /* ... */ });
const audioBase64 = await response.text(); // or from JSON field
```

#### Step 2: Decode Base64 to Binary
```javascript
const binaryBuffer = Buffer.from(audioBase64, 'base64');
// Buffer size should be divisible by 4 (4 bytes per Float32 sample)
```

#### Step 3: Convert to Float32 Array
```javascript
const float32Data = new Float32Array(
  binaryBuffer.buffer,
  binaryBuffer.byteOffset,
  binaryBuffer.length / 4
);
```

#### Step 4: Convert Float32 to Int16 PCM
```javascript
function float32ToInt16(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}

const int16Data = float32ToInt16(float32Data);
```

#### Step 5: Create WAV File
```javascript
function createWavHeader(dataSize, sampleRate, numChannels, bitsPerSample) {
  const header = Buffer.alloc(44);
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);  // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return header;
}

const pcmDataSize = int16Data.length * 2;
const wavHeader = createWavHeader(pcmDataSize, 24000, 1, 16);
const pcmBuffer = Buffer.from(int16Data.buffer);
const wavFile = Buffer.concat([wavHeader, pcmBuffer]);

fs.writeFileSync('output.wav', wavFile);
```

---

## 📊 Example Calculation

For a 3-second audio clip:

```
Samples = 24,000 Hz × 3 seconds = 72,000 samples
Float32 size = 72,000 samples × 4 bytes = 288,000 bytes
Base64 size ≈ 288,000 × 1.33 = 383,040 characters

Final WAV size = 44 bytes (header) + 144,000 bytes (16-bit PCM) = 144,044 bytes
```

---

## ⚠️ Common Pitfalls

### ❌ Wrong Sample Rate
```javascript
// WRONG: Using 16kHz or 22.05kHz
const SAMPLE_RATE = 16000;  // ❌ Audio will sound distorted!
```

```javascript
// CORRECT: Use 24kHz
const SAMPLE_RATE = 24000;  // ✅ Correct for CosyVoice3
```

### ❌ Treating as WAV File
```javascript
// WRONG: Assuming data already has WAV header
const wavData = Buffer.from(base64, 'base64');
fs.writeFileSync('audio.wav', wavData);  // ❌ No WAV header!
```

```javascript
// CORRECT: Add WAV header yourself
const float32Data = convertToFloat32(base64);
const int16Data = float32ToInt16(float32Data);
const wavData = addWavHeader(int16Data, 24000);  // ✅
```

### ❌ Skipping Float32 → Int16 Conversion
```javascript
// WRONG: Directly using Float32 as WAV data
const wavData = Buffer.from(float32Array.buffer);  // ❌ Invalid audio!
```

```javascript
// CORRECT: Convert to Int16 PCM
const int16Data = float32ToInt16(float32Array);  // ✅
```

---

## 🔍 Verification Steps

### 1. Check Base64 Decoding
```javascript
console.log('Binary size:', binaryBuffer.length);
console.log('Should be divisible by 4:', binaryBuffer.length % 4 === 0);
```

### 2. Verify Float32 Range
```javascript
const min = Math.min(...float32Data);
const max = Math.max(...float32Data);
console.log('Sample range:', [min, max]);
console.log('Should be in [-1, 1]:', min >= -1.1 && max <= 1.1);
```

### 3. Check Duration
```javascript
const duration = float32Data.length / 24000;
console.log('Audio duration:', duration.toFixed(2), 'seconds');
```

### 4. Validate WAV File
```bash
# Use ffprobe to check final WAV file
ffprobe output.wav
# Should show:
# - Sample rate: 24000 Hz
# - Channels: 1 (mono)
# - Format: pcm_s16le (16-bit PCM)
```

---

## 🛠️ Reference Implementation

See [`asset/convert_audio.js`](./asset/convert_audio.js) for a complete Node.js implementation.

### Quick Test
```bash
# 1. Get audio from API and save base64 to file
curl -X POST http://your-api/synthesize \
  -F "text=测试文本" \
  | base64 > sample_audio.txt

# 2. Convert to WAV
node asset/convert_audio.js

# 3. Play the WAV file
ffplay sample_audio.wav
```

---

## 📚 API Endpoints

### `/synthesize` (Streaming)
- Returns: Raw Float32 PCM bytes
- Use for: Real-time streaming synthesis
- Processing: Requires Float32 → Int16 conversion + WAV header

### `/synthesize_complete` (Complete)
- Returns: Complete WAV file with header
- Use for: Simple batch synthesis
- Processing: Direct base64 decode → save as .wav

---

## 🐛 Troubleshooting

### Audio sounds distorted/garbled
- ✅ Check sample rate is set to 24000 Hz
- ✅ Verify Float32 → Int16 conversion
- ✅ Ensure proper byte order (little-endian)

### Audio plays too fast/slow
- ✅ Wrong sample rate in WAV header
- ✅ Should be 24000 Hz, not 16000 or 22050

### Audio sounds robotic/metallic
- ✅ Incorrect bit depth or format
- ✅ Ensure 16-bit PCM in WAV file

### No sound at all
- ✅ Check WAV header is correctly formatted
- ✅ Verify data chunk size matches actual data

---

## 📝 Model Information

| Model | Sample Rate | Output Format |
|-------|-------------|---------------|
| CosyVoice-300M | 22050 Hz | Float32 PCM |
| CosyVoice2-0.5B | **24000 Hz** | Float32 PCM |
| Fun-CosyVoice3-0.5B-2512 | **24000 Hz** | Float32 PCM |

**Current API uses**: CosyVoice3 (24000 Hz)

---

## 🔗 Additional Resources

- [CosyVoice Official Docs](https://funaudiollm.github.io/cosyvoice3/)
- [WAV File Format Specification](http://soundfile.sapp.org/doc/WaveFormat/)
- [PCM Audio Explanation](https://en.wikipedia.org/wiki/Pulse-code_modulation)

---

**Last Updated**: 2025-12-22  
**API Version**: CosyVoice3 (Fun-CosyVoice3-0.5B-2512)

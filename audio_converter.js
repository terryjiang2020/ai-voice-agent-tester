// Utility: convert streaming base64 PCM16 chunks to playable audio in the browser.
// Assumes chunks are PCM16 mono at 16 kHz (matches current WS /api outputs).
// Usage (in your WebSocket onmessage):
//   if (msg.type === 'tts' && msg.content?.audio) {
//     enqueueBase64PcmChunk(msg.content.audio)
//   }

let audioContext
const decodedQueue = []
let isPlaying = false

export async function enqueueBase64PcmChunk(b64, { sampleRate = 16000 } = {}) {
  if (!b64) return
  const pcmBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const wavBytes = pcm16ToWav(pcmBytes, sampleRate, 1)
  const ctx = getAudioContext(sampleRate)
  const buffer = await ctx.decodeAudioData(wavBytes.buffer.slice(wavBytes.byteOffset, wavBytes.byteOffset + wavBytes.byteLength))
  decodedQueue.push(buffer)
  if (!isPlaying) playQueue()
}

export function stopPlayback() {
  decodedQueue.length = 0
  isPlaying = false
  try { audioContext?.close() } catch (_) {}
  audioContext = null
}

function getAudioContext(sampleRate) {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate })
  }
  return audioContext
}

function playQueue() {
  if (!audioContext || decodedQueue.length === 0) {
    isPlaying = false
    return
  }
  isPlaying = true
  const next = decodedQueue.shift()
  const source = audioContext.createBufferSource()
  source.buffer = next
  source.connect(audioContext.destination)
  source.onended = () => playQueue()
  source.start()
}

function pcm16ToWav(pcmBytes, sampleRate, channels) {
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = pcmBytes.length
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')

  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)

  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  const out = new Uint8Array(buffer)
  out.set(pcmBytes, 44)
  return out
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
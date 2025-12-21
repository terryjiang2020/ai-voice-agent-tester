// Unified streaming client for /api/voice/stream (NDJSON)
// Sends raw audio bytes (application/octet-stream) and parses NDJSON frames.

export async function sendVoiceStream(audioBuffer, { onFrame, signal } = {}) {
  const url = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
  const endpoint = `${url}/api/voice/stream`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: audioBuffer,
    signal,
  })

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffered = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffered += decoder.decode(value, { stream: true })
    const lines = buffered.split('\n')
    buffered = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const frame = JSON.parse(line)
        onFrame?.(frame)
      } catch (e) {
        console.warn('Failed to parse frame', line, e)
      }
    }
  }

  if (buffered.trim()) {
    try {
      onFrame?.(JSON.parse(buffered))
    } catch (e) {
      console.warn('Failed to parse trailing frame', buffered, e)
    }
  }
}

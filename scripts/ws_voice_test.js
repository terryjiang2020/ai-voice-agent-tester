// Minimal WS voice test against devserver
// Usage: node scripts/ws_voice_test.js

import WebSocket from 'ws'

const WS_URL = process.env.VITE_BACKEND_WS || 'wss://devserver.elasticdash.com/ws/voice'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('[ws_voice_test] Connecting to', WS_URL)
  const ws = new WebSocket(WS_URL)

  ws.on('open', async () => {
    console.log('[ws_voice_test] connected')
    ws.send(JSON.stringify({ type: 'input_text', text: 'Hello, can you introduce yourself?' }))
    await sleep(1000)
    ws.send(JSON.stringify({ type: 'input_text', text: '请用中文回答：今天天气怎么样？' }))
  })

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'asr') {
        console.log('[ASR]', msg.content?.text)
      } else if (msg.type === 'llm') {
        const { text, partial } = msg.content || {}
        console.log(`[LLM${partial ? ' partial' : ' final'}]`, text)
      } else if (msg.type === 'tts') {
        const b64 = msg.content?.audio
        console.log('[TTS chunk] len=', b64 ? b64.length : 0)
      } else if (msg.type === 'error') {
        console.error('[ERROR]', msg.content?.message)
      } else if (msg.type === 'control') {
        console.log('[CONTROL]', msg.content?.message)
      } else {
        console.log('[MSG]', msg)
      }
    } catch (e) {
      console.log('[RAW]', data.toString())
    }
  })

  ws.on('close', () => {
    console.log('[ws_voice_test] closed')
  })

  ws.on('error', (err) => {
    console.error('[ws_voice_test] error', err.message)
  })

  // Auto-close after 15 seconds
  setTimeout(() => ws.close(), 15000)
}

main().catch(err => {
  console.error('Test failed', err)
  process.exit(1)
})

import { useState, useEffect, useRef } from 'react'
import './App.css'
import LocalVoiceService from './services/localVoiceService'

function App() {
  const [isConnected, setIsConnected] = useState(false)
  const [transcript, setTranscript] = useState([])
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [orderInfo, setOrderInfo] = useState({ items: '', name: '', phone: '' })
  const [assistantTexts, setAssistantTexts] = useState({})
  const [selectedModel, setSelectedModel] = useState('openai') // 'openai', 'grok', or 'local'

  const peerConnectionRef = useRef(null)
  const dataChannelRef = useRef(null)
  const audioElementRef = useRef(null)
  const websocketRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)
  const nextPlayTimeRef = useRef(0)
  const localServiceRef = useRef(null)

  // Connect to selected model
  const connect = async () => {
    if (selectedModel === 'openai') {
      await connectOpenAI()
    } else if (selectedModel === 'grok') {
      await connectGrok()
    } else if (selectedModel === 'local') {
      await connectLocal()
    }
  }

  const connectOpenAI = async () => {
    try {
      setConnectionStatus('connecting')
      setError('')

      // Step 1: Get ephemeral token from our server
      console.log('Fetching ephemeral token from server...')
      const tokenResponse = await fetch('http://localhost:3000/token?model=openai')
      if (!tokenResponse.ok) {
        throw new Error(`Failed to fetch ephemeral token: ${tokenResponse.statusText}`)
      }
      const data = await tokenResponse.json()
      const EPHEMERAL_KEY = data.value

      console.log('Ephemeral token received, setting up WebRTC...')

      // Step 2: Create a peer connection
      const pc = new RTCPeerConnection()
      peerConnectionRef.current = pc

      // Step 3: Set up to play remote audio from the model
      if (!audioElementRef.current) {
        audioElementRef.current = document.createElement('audio')
        audioElementRef.current.autoplay = true
        audioElementRef.current.volume = 1.0
      }
      pc.ontrack = (e) => {
        console.log('Received audio track from server')
        audioElementRef.current.srcObject = e.streams[0]
        audioElementRef.current.play().catch(err => console.log('Audio play error:', err))
      }

      // Step 4: Add local audio track for microphone input
      console.log('Requesting microphone access...')
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
          channelCount: 1
        },
      })
      pc.addTrack(ms.getTracks()[0])

      // Step 5: Set up data channel for sending and receiving events
      const dc = pc.createDataChannel('oai-events')
      dataChannelRef.current = dc

      dc.onopen = () => {
        console.log('Data channel opened - connected!')
        setIsConnected(true)
        setConnectionStatus('connected')
      }

      dc.onclose = () => {
        console.log('Data channel closed')
        setIsConnected(false)
        setConnectionStatus('disconnected')
      }

      dc.onerror = (err) => {
        console.error('Data channel error:', err)
        setError(`Data channel error: ${err}`)
      }

      // Listen for server events
      dc.addEventListener('message', (e) => {
        const event = JSON.parse(e.data)
        console.log('Received event:', event.type)
        console.log('Event data:', event)

        switch (event.type) {
          case 'conversation.item.added':
            if (event.item?.type === 'message') {
              const role = event.item.role
              const content = event.item.content?.[0]
              console.log('Message role:', role, 'content:', content, 'content array length:', event.item.content?.length)
              if (role === 'user' && content?.transcript) {
                addTranscript(role, content.transcript)
              }
              // For assistant, content is empty array initially, we'll accumulate from deltas
            }
            break

          case 'response.output_audio_transcript.delta':
            if (event.delta) {
              const responseId = event.response_id
              setAssistantTexts(prev => ({
                ...prev,
                [responseId]: (prev[responseId] || '') + event.delta
              }))
              console.log(`Delta for ${responseId}:`, event.delta)
            }
            break

          case 'response.output_audio_transcript.done':
            const responseId = event.response_id
            const finalText = assistantTexts[responseId] || ''
            console.log(`Done for ${responseId}, final text:`, finalText)
            if (finalText) {
              addTranscript('assistant', finalText)
              setAssistantTexts(prev => {
                const newTexts = { ...prev }
                delete newTexts[responseId]
                return newTexts
              })
            }
            break

          case 'conversation.item.input_audio_transcription.completed':
            if (event.transcript) {
              addTranscript('user', event.transcript)
            }
            break

          case 'error':
            console.error('API Error:', event.error)
            setError(`API Error: ${event.error.message}`)
            break
        }
      })

      // Step 6: Start the session using the Session Description Protocol (SDP)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      console.log('Connecting to OpenAI Realtime API...')
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          'Content-Type': 'application/sdp',
        },
      })

      if (!sdpResponse.ok) {
        throw new Error(`SDP exchange failed: ${sdpResponse.statusText}`)
      }

      const answer = {
        type: 'answer',
        sdp: await sdpResponse.text(),
      }
      await pc.setRemoteDescription(answer)

      console.log('WebRTC connection established successfully')
    } catch (err) {
      console.error('Connection error:', err)
      setError(`Failed to connect: ${err.message}`)
      setConnectionStatus('disconnected')
    }
  }

  // Disconnect from the API
  const disconnect = () => {
    // Close local service
    if (localServiceRef.current) {
      localServiceRef.current.disconnect()
      localServiceRef.current = null
    }

    // Close WebSocket if using Grok
    if (websocketRef.current) {
      websocketRef.current.close()
      websocketRef.current = null
    }

    // Close AudioContext if using Grok
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // Clear audio queue
    audioQueueRef.current = []
    isPlayingRef.current = false
    nextPlayTimeRef.current = 0

    // Close WebRTC if using OpenAI
    if (dataChannelRef.current) {
      dataChannelRef.current.close()
      dataChannelRef.current = null
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }

    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null
    }

    setIsConnected(false)
    setConnectionStatus('disconnected')
  }

  // Play audio queue smoothly without gaps
  const playAudioQueue = (audioContext) => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false
      return
    }

    isPlayingRef.current = true
    const float32 = audioQueueRef.current.shift()

    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(1, float32.length, 24000)
    audioBuffer.getChannelData(0).set(float32)
    
    const bufferSource = audioContext.createBufferSource()
    bufferSource.buffer = audioBuffer
    bufferSource.connect(audioContext.destination)

    // Calculate when to start this chunk
    const currentTime = audioContext.currentTime
    const startTime = Math.max(currentTime, nextPlayTimeRef.current)
    
    bufferSource.start(startTime)
    
    // Update next play time to ensure continuous playback
    nextPlayTimeRef.current = startTime + audioBuffer.duration

    // When this chunk finishes, play the next one
    bufferSource.onended = () => {
      playAudioQueue(audioContext)
    }
  }

  // Connect to local model service
  const connectLocal = async () => {
    try {
      setConnectionStatus('connecting')
      setError('')

      console.log('Connecting to local service...')

      // Create local service instance
      const localService = new LocalVoiceService()
      localServiceRef.current = localService

      // Set up event handlers
      localService.onConnectionChange = (status) => {
        console.log('Connection status:', status)
        setConnectionStatus(status)
        setIsConnected(status === 'connected')
      }

      localService.onTranscript = (result) => {
        console.log('Transcript:', result)
        if (result.isFinal) {
          addTranscript('user', result.text)
        }
      }

      localService.onLLMDelta = (delta) => {
        // Accumulate LLM response
        setAssistantTexts(prev => {
          const current = prev['local'] || ''
          return { ...prev, local: current + delta }
        })
      }

      localService.onLLMDone = (text) => {
        console.log('LLM done:', text)
        addTranscript('assistant', text)
        setAssistantTexts(prev => {
          const newTexts = { ...prev }
          delete newTexts['local']
          return newTexts
        })
      }

      localService.onTTSDone = () => {
        console.log('TTS done')
      }

      localService.onError = (error) => {
        console.error('Local service error:', error)
        setError(`Local service error: ${error.message}`)
      }

      // Connect to local WebSocket server
      const wsUrl = import.meta.env.VITE_BACKEND_WS || 'ws://localhost:8000/ws'
      await localService.connect(wsUrl)

      console.log('✅ Connected to local service')

    } catch (err) {
      console.error('Connection error:', err)
      setError(`Failed to connect to local service: ${err.message}`)
      setConnectionStatus('disconnected')
    }
  }

  const connectGrok = async () => {
    try {
      setConnectionStatus('connecting')
      setError(null)

      // Reset audio queue
      audioQueueRef.current = []
      isPlayingRef.current = false
      nextPlayTimeRef.current = 0

      // Get ephemeral token for Grok
      const tokenResponse = await fetch('http://localhost:3000/token?model=grok')
      if (!tokenResponse.ok) {
        throw new Error('Failed to get Grok ephemeral token')
      }
      const { token } = await tokenResponse.json()

      // Create WebSocket connection
      const ws = new WebSocket(
        `wss://api.x.ai/v1/realtime?model=grok-2-latest`,
        ['realtime', `openai-insecure-api-key.${token}`, 'openai-beta.realtime-v1']
      )
      websocketRef.current = ws

      // Create AudioContext for audio processing
      const audioContext = new AudioContext({ sampleRate: 24000 })
      audioContextRef.current = audioContext

      ws.onopen = async () => {
        console.log('Grok WebSocket connected')
        
        // Send session configuration
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            voice: 'Ara',
            instructions: formatter,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            }
          }
        }))

        // Start capturing microphone audio
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 24000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })

        const source = audioContext.createMediaStreamSource(stream)
        const processor = audioContext.createScriptProcessor(4096, 1, 1)

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0)
            // Convert Float32Array to Int16Array
            const pcm16 = new Int16Array(inputData.length)
            for (let i = 0; i < inputData.length; i++) {
              const s = Math.max(-1, Math.min(1, inputData[i]))
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
            }
            // Convert to base64
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)))
            ws.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64
            }))
          }
        }

        source.connect(processor)
        processor.connect(audioContext.destination)

        setIsConnected(true)
        setConnectionStatus('connected')
      }

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        console.log('Grok message:', message.type)

        if (message.type === 'session.updated') {
          console.log('Session configured:', message.session)
        } else if (message.type === 'input_audio_buffer.speech_started') {
          console.log('User started speaking')
        } else if (message.type === 'input_audio_buffer.speech_stopped') {
          console.log('User stopped speaking')
        } else if (message.type === 'conversation.item.input_audio_transcription.completed') {
          const userText = message.transcript
          console.log('User said:', userText)
          addTranscript('user', userText)
        } else if (message.type === 'response.output_audio_transcript.delta') {
          const responseId = message.response_id
          if (!assistantTextsRef.current[responseId]) {
            assistantTextsRef.current[responseId] = ''
          }
          assistantTextsRef.current[responseId] += message.delta
          console.log('Accumulating AI text:', assistantTextsRef.current[responseId])
        } else if (message.type === 'response.output_audio_transcript.done') {
          const responseId = message.response_id
          const fullText = assistantTextsRef.current[responseId] || message.transcript
          if (fullText) {
            console.log('AI response complete:', fullText)
            addTranscript('AI', fullText)
            delete assistantTextsRef.current[responseId]
          }
        } else if (message.type === 'response.output_audio.delta') {
          // Queue audio for smooth playback
          if (message.delta && audioContext) {
            try {
              // Decode base64 to PCM16
              const binaryString = atob(message.delta)
              const bytes = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
              }
              const pcm16 = new Int16Array(bytes.buffer)
              
              // Convert Int16Array to Float32Array
              const float32 = new Float32Array(pcm16.length)
              for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF)
              }

              // Add to queue and start playing if not already
              audioQueueRef.current.push(float32)
              if (!isPlayingRef.current) {
                playAudioQueue(audioContext)
              }
            } catch (err) {
              console.error('Error decoding audio:', err)
            }
          }
        } else if (message.type === 'response.output_audio.done') {
          console.log('Audio response complete')
        } else if (message.type === 'error') {
          console.error('Grok error:', message.error)
          setError(`Grok error: ${message.error.message}`)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('WebSocket connection error')
        setConnectionStatus('disconnected')
      }

      ws.onclose = () => {
        console.log('Grok WebSocket closed')
        setIsConnected(false)
        setConnectionStatus('disconnected')
        if (audioContext) {
          audioContext.close()
        }
      }

    } catch (err) {
      console.error('Grok connection error:', err)
      setError(`Failed to connect to Grok: ${err.message}`)
      setConnectionStatus('disconnected')
    }
  }

  // Add message to transcript & extract order info
  const addTranscript = (role, text) => {
    console.log('addTranscript called with role:', role, 'text:', text) // 调试日志
    if (!text || text.trim() === '') {
      console.log('Skipping empty text')
      return
    }
    setTranscript(prev => {
      const newTranscript = [...prev, { role, text, timestamp: new Date().toLocaleTimeString() }]
      console.log('New transcript:', newTranscript) // 调试日志
      return newTranscript
    })
    if (role === 'user' || role === 'assistant' || role === 'AI') {
      console.log('Processing for order info extraction with text:', text) // 调试日志
      let items = orderInfo.items
      let name = orderInfo.name
      let phone = orderInfo.phone

      // 菜品 - 更宽泛的匹配
      const itemPatterns = [
        /(点了|选择了|菜品|订单|order|items?|想要|要吃)[:：]?\s*([\w\W]{2,50}?)(?=，|。|,|\n|$|姓名|电话|name|phone)/i,
        /点餐[:：]?\s*([\w\W]{2,50}?)(?=，|。|,|\n|$)/i
      ]
      for (const pattern of itemPatterns) {
        const match = text.match(pattern)
        if (match && match[1]) {
          items = match[1].trim()
          console.log('Found items:', items) // 调试日志
          break
        }
      }

      // 姓名 - 更宽泛的匹配
      const namePatterns = [
        /(姓名|name|order for|顾客名|名字|叫|我是)[:：]?\s*([\w\u4e00-\u9fa5]{1,20})/i,
        /我叫([\w\u4e00-\u9fa5]{1,20})/i
      ]
      for (const pattern of namePatterns) {
        const match = text.match(pattern)
        if (match && match[2]) {
          name = match[2].trim()
          console.log('Found name:', name) // 调试日志
          break
        }
      }

      // 电话 - 更宽泛的匹配
      const phonePatterns = [
        /(电话|phone|number|手机号|联系方式|联系电话)[:：]?\s*([0-9\-\+\(\)\s]{6,20})/i,
        /([0-9\-\+\(\)\s]{8,15})/ // 直接匹配手机号
      ]
      for (const pattern of phonePatterns) {
        const match = text.match(pattern)
        if (match && match[2]) {
          phone = match[2].trim()
          console.log('Found phone:', phone) // 调试日志
          break
        } else if (match && match[1] && !phone) {
          phone = match[1].trim()
          console.log('Found phone (direct):', phone) // 调试日志
        }
      }

      console.log('Updating orderInfo:', { items, name, phone }) // 调试日志
      setOrderInfo({ items, name, phone })
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [])

  // Auto-connect on mount
  useEffect(() => {
    const attemptAutoConnect = async () => {
      console.log('Auto-connecting to Realtime API via WebRTC')
      await connect()
    }
    attemptAutoConnect()
  }, [])

  return (
    <div className="App">
      <h1>🎙️ AI Voice Agent Tester</h1>
      <div style={{margin: '1rem 0'}}>
        <label htmlFor="model-select" style={{marginRight: '10px', fontWeight: 'bold'}}>Model:</label>
        <select 
          id="model-select"
          value={selectedModel} 
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={isConnected}
          style={{padding: '8px 12px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc'}}
        >
          <option value="openai">OpenAI GPT-4o Realtime</option>
          <option value="grok">Grok Voice Agent</option>
          <option value="local">🏠 Local Model (Fun-ASR + CosyVoice)</option>
        </select>
        {isConnected && <span style={{marginLeft: '10px', color: '#666', fontSize: '14px'}}>⚠️ Disconnect to change model</span>}
      </div>
      <p>Connect to {selectedModel === 'openai' ? 'ChatGPT Realtime API via WebRTC' : selectedModel === 'grok' ? 'Grok Voice Agent API via WebSocket' : 'Local Voice Service (ASR + LLM + TTS)'}</p>

      <div className="voice-panel">
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        {!isConnected && (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p>Connecting to API...</p>
          </div>
        )}

        {isConnected && (
          <>
            <div className={`status ${connectionStatus}`}>
              Status: {connectionStatus === 'connected' ? '🟢 Connected' : '🔴 Disconnected'}
            </div>

            <div className="controls">
              <div>🎤 Microphone streaming is active via WebRTC.</div>
            </div>

            <div className="button-group">
              <button onClick={disconnect}>Disconnect</button>
            </div>

            <div className="order-info" style={{margin:'1rem 0',padding:'1rem',border:'1px solid #eee',borderRadius:'8px'}}>
              <h4>已收集的点单信息</h4>
              <div><strong>菜品：</strong>{orderInfo.items || <span style={{color:'#888'}}>未填写</span>}</div>
              <div><strong>姓名：</strong>{orderInfo.name || <span style={{color:'#888'}}>未填写</span>}</div>
              <div><strong>电话：</strong>{orderInfo.phone || <span style={{color:'#888'}}>未填写</span>}</div>
            </div>

            <div className="transcript">
              <h4>Conversation</h4>
              {transcript.length === 0 && (
                <p style={{ color: '#888', textAlign: 'center' }}>
                  Start talking...
                </p>
              )}
              {transcript.map((item, index) => (
                <div key={index} className={`transcript-item ${item.role}`}>
                  <strong>{item.role === 'user' ? 'You' : 'AI'}:</strong> {item.text}
                  <span style={{ fontSize: '0.8em', marginLeft: '10px', opacity: 0.6 }}>
                    {item.timestamp}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: '2rem', fontSize: '0.9em', opacity: 0.7 }}>
        <p>
          Using WebRTC connection with ephemeral keys for secure browser-based voice interaction.
          <br />
          Server must be running on port 3000 to mint ephemeral tokens.
        </p>
      </div>
    </div>
  )
}

export default App

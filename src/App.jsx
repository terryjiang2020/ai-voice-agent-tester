import { useState, useEffect, useRef } from 'react'
import './App.css'
import { useVoiceChat } from './hooks/useVoiceChat'
import { sendVoiceStream } from './services/voiceStreamClient'
import { enqueueBase64PcmChunk, stopPlayback } from '../audio_converter.js'

function App() {
  const [isConnected, setIsConnected] = useState(false)
  const [transcript, setTranscript] = useState([])
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [orderInfo, setOrderInfo] = useState({ items: '', name: '', phone: '' })
  const [assistantTexts, setAssistantTexts] = useState({})
  const [selectedModel, setSelectedModel] = useState('local') // 'openai', 'grok', or 'local'
  const [micError, setMicError] = useState('')
  const [streamStatus, setStreamStatus] = useState('idle')
  const [streamLog, setStreamLog] = useState([])

  const peerConnectionRef = useRef(null)
  const dataChannelRef = useRef(null)
  const audioElementRef = useRef(null)
  const websocketRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)
  const nextPlayTimeRef = useRef(0)
  const localServiceRef = useRef(null)
  const [useNewVoiceWS, setUseNewVoiceWS] = useState(false)
  const voiceHookRef = useRef(null)

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

    stopPlayback()

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

  const appendStreamLog = (msg) => {
    setStreamLog((prev) => [...prev.slice(-20), { msg, ts: new Date().toLocaleTimeString() }])
  }

  const recordOnce = async (durationMs = 2000) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    const chunks = []
    return new Promise((resolve, reject) => {
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onerror = reject
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const arrayBuffer = await blob.arrayBuffer()
        resolve(arrayBuffer)
      }
      recorder.start(250)
      setTimeout(() => recorder.stop(), durationMs)
    })
  }

  const runUnifiedStream = async () => {
    try {
      setStreamStatus('recording')
      appendStreamLog('Recording mic for 2s...')
      const audioBuffer = await recordOnce(2000)
      setStreamStatus('streaming')
      appendStreamLog('Sending to /api/voice/stream ...')

      await sendVoiceStream(audioBuffer, {
        onFrame: (frame) => {
          if (frame.type === 'asr') {
            appendStreamLog(`ASR: ${frame.text}`)
            addTranscript('user', frame.text)
          } else if (frame.type === 'llm') {
            appendStreamLog(`LLM${frame.partial ? ' partial' : ' final'}: ${frame.text}`)
            if (!frame.partial) addTranscript('assistant', frame.text)
          } else if (frame.type === 'tts') {
            enqueueBase64PcmChunk(frame.audio)
          } else if (frame.type === 'done') {
            appendStreamLog('Stream done')
          } else if (frame.type === 'error') {
            appendStreamLog(`Error: ${frame.message}`)
            setError(frame.message || 'Stream error')
          }
        },
      })

      setStreamStatus('done')
    } catch (e) {
      setStreamStatus('error')
      setError(e.message)
      appendStreamLog(`Error: ${e.message}`)
    }
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

      // Step 1: Create WebSocket connection
      const ws = new WebSocket('wss://devserver.elasticdash.com/ws/voice/stream')
      websocketRef.current = ws

      let reconnectAttempts = 0;
      const maxReconnectAttempts = 5;

      const attemptReconnect = () => {
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`Reconnecting... Attempt ${reconnectAttempts}`);
          setTimeout(connectLocal, 2000); // Retry after 2 seconds
        } else {
          console.error("Max reconnect attempts reached");
          setError("Unable to reconnect after multiple attempts");
        }
      };

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true); // Ensure isConnected is updated
        setConnectionStatus('connected'); // Ensure connectionStatus is updated
        console.log('Updated states: isConnected = true, connectionStatus = connected');
      }

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        console.log('Received event:', message)

        switch (message.type) {
          case 'asr.partial':
            console.log('[ASR Partial] Text:', message.text);
            // Update the same message until we get final
            updateLastTranscript('user', message.text, true);
            break;
          case 'asr.final':
            console.log('[ASR Final] Text:', message.text);
            // Finalize the transcript message
            updateLastTranscript('user', message.text, false);
            break;
          case 'response.output_audio_transcript.delta':
            console.log('[AI Delta] Text:', message.text);
            // Update AI response (partial)
            updateLastTranscript('AI', message.text, true);
            break;
          case 'response.output_audio_transcript.done':
            console.log('[AI Done] Text:', message.text);
            // Finalize AI response
            updateLastTranscript('AI', message.text, false);
            break;
          case 'error':
            console.error('[WebSocket Error] Message:', message.message);
            setError(message.message)
            break
          case 'done':
            console.log('Stream complete')
            break
        }
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected')
        setConnectionStatus('disconnected')
        attemptReconnect();
      }

      ws.onerror = (err) => {
        console.error('WebSocket error:', err)
        setError('WebSocket connection error')
        setConnectionStatus('disconnected')
        attemptReconnect();
      }

      // Step 2: Start streaming audio with VAD
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioContext = new AudioContext({ sampleRate: 16000 })
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)

      audioContextRef.current = audioContext

      // VAD (Voice Activity Detection) state
      let isSpeaking = false
      let silenceTimer = null
      let speechStartTime = null
      let speechFrameCount = 0 // Count frames above threshold
      const SILENCE_THRESHOLD = 0.03 // Balanced threshold (0.02-0.05 recommended)
      const SILENCE_TIMEOUT = 2000 // 2 seconds of silence before ending speech
      const MIN_SPEECH_DURATION = 1000 // Minimum 1 second of speech
      const MIN_SPEECH_FRAMES = 3 // Need 3 consecutive frames to start (avoid noise)

      processor.onaudioprocess = (event) => {
        const audioData = event.inputBuffer.getChannelData(0);

        // Calculate RMS (Root Mean Square) to determine volume level
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
          sum += audioData[i] * audioData[i];
        }
        const rms = Math.sqrt(sum / audioData.length);

        if (rms > SILENCE_THRESHOLD) {
          // Potential speech detected
          if (!isSpeaking) {
            speechFrameCount++
            // Only start speech if we have enough consecutive frames (filter noise)
            if (speechFrameCount >= MIN_SPEECH_FRAMES) {
              isSpeaking = true
              speechStartTime = Date.now()
              speechFrameCount = 0
              console.log('[VAD] Speech started, RMS:', rms)
              // Notify backend that speech started
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'speech.start' }))
              }
            }
          } else {
            // Already speaking, reset frame count
            speechFrameCount = 0
          }

          // Clear silence timer if speech continues
          if (silenceTimer) {
            clearTimeout(silenceTimer)
            silenceTimer = null
          }

          // Send audio frame
          const int16Array = new Int16Array(audioData.length);
          for (let i = 0; i < audioData.length; i++) {
            int16Array[i] = Math.min(1, Math.max(-1, audioData[i])) * 32767;
          }

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(int16Array.buffer);
          }

        } else {
          // Below threshold
          if (!isSpeaking) {
            // Not speaking yet, reset frame count
            speechFrameCount = 0
          } else {
            // Was speaking, now silence detected
            const speechDuration = Date.now() - speechStartTime

            // Only trigger silence detection if minimum speech duration met
            if (speechDuration >= MIN_SPEECH_DURATION) {
              if (!silenceTimer) {
                silenceTimer = setTimeout(() => {
                  console.log('[VAD] Speech ended after silence timeout')
                  isSpeaking = false
                  silenceTimer = null
                  speechStartTime = null
                  speechFrameCount = 0

                  // Notify backend that speech ended
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'speech.end' }))
                  }
                }, SILENCE_TIMEOUT)
              }
            }
          }
        }
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      console.log('Audio streaming started with VAD')
    } catch (err) {
      console.error('Connection error:', err)
      setError(`Failed to connect: ${err.message}`)
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

  // Update the last transcript message (for partial updates)
  const updateLastTranscript = (role, text, isPartial = false) => {
    console.log('updateLastTranscript called with role:', role, 'text:', text, 'isPartial:', isPartial)
    if (!text || text.trim() === '') {
      console.log('Skipping empty text')
      return
    }
    setTranscript(prev => {
      const newTranscript = [...prev]
      // Find the last message with the same role
      const lastIndex = newTranscript.length - 1
      if (lastIndex >= 0 && newTranscript[lastIndex].role === role && newTranscript[lastIndex].isPartial) {
        // Update existing partial message
        newTranscript[lastIndex] = {
          ...newTranscript[lastIndex],
          text,
          isPartial,
          timestamp: new Date().toLocaleTimeString()
        }
      } else {
        // Add new message
        newTranscript.push({
          role,
          text,
          isPartial,
          timestamp: new Date().toLocaleTimeString()
        })
      }
      console.log('Updated transcript:', newTranscript)
      return newTranscript
    })
  }

  // Add message to transcript & extract order info
  const addTranscript = (role, text) => {
    console.log('addTranscript called with role:', role, 'text:', text) // 调试日志
    if (!text || text.trim() === '') {
      console.log('Skipping empty text')
      return
    }
    setTranscript(prev => {
      const newTranscript = [...prev, { role, text, isPartial: false, timestamp: new Date().toLocaleTimeString() }]
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

  // New Voice WS demo (optional) when user toggles
  useEffect(() => {
    if (!useNewVoiceWS) return
    voiceHookRef.current = useVoiceChat()
    voiceHookRef.current.connect()
    return () => {
      // no explicit disconnect API in hook; WS will close on page unload
    }
  }, [useNewVoiceWS])

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
            <button onClick={connect} style={{marginTop:'8px'}}>Connect</button>
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

            {selectedModel === 'local' && (
              <div style={{marginTop:'1rem',padding:'1rem',border:'1px dashed #ccc',borderRadius:'8px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <input id="toggle-new-ws" type="checkbox" checked={useNewVoiceWS} onChange={(e)=>setUseNewVoiceWS(e.target.checked)} />
                  <label htmlFor="toggle-new-ws">(可选) `/ws/voice` WebSocket（默认使用 REST /api/voice/stream）</label>
                </div>
                {useNewVoiceWS ? (
                  <div style={{marginTop:'0.5rem',display:'flex',gap:'8px',flexWrap:'wrap'}}>
                    <button onClick={()=>{voiceHookRef.current?.startRecording(); setMicError('')}}>Start Mic</button>
                    <button onClick={()=>voiceHookRef.current?.stopRecording()}>Stop Mic</button>
                    <button onClick={()=>voiceHookRef.current?.sendText('你好，帮我点一份宫保鸡丁和米饭')}>Send Sample Text</button>
                    <button onClick={()=>voiceHookRef.current?.clear()}>Clear Conversation</button>
                    <button onClick={()=>{try {voiceHookRef.current?.startRecording(); setMicError('')} catch(e){setMicError('麦克风未开启，请允许权限后重试');}}}>Retry Mic</button>
                    <button onClick={()=>{connectLocal();}}>Retry Connect</button>
                    <button onClick={runUnifiedStream}>Record 2s & Stream (REST)</button>
                  </div>
                ) : (
                  <div style={{marginTop:'0.5rem',display:'flex',gap:'8px',flexWrap:'wrap'}}>
                    <button onClick={runUnifiedStream}>录 2 秒并调用 /api/voice/stream</button>
                    <button onClick={()=>{appendStreamLog('手动刷新流'); setStreamStatus('idle')}}>清空日志</button>
                  </div>
                )}
                {micError && (
                  <div style={{marginTop:'0.5rem',color:'#d9534f'}}>{micError}</div>
                )}
                {streamStatus !== 'idle' && (
                  <div style={{marginTop:'0.75rem'}}>
                    <div style={{fontWeight:'bold'}}>Unified Stream Log ({streamStatus})</div>
                    <div style={{maxHeight:'160px',overflowY:'auto',border:'1px solid #eee',padding:'8px',borderRadius:'6px',background:'#fafafa'}}>
                      {streamLog.length === 0 && <div style={{color:'#999'}}>Waiting for frames...</div>}
                      {streamLog.map((item, idx) => (
                        <div key={idx} style={{fontSize:'12px'}}>
                          <span style={{opacity:0.6, marginRight:'6px'}}>{item.ts}</span>{item.msg}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

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
                <div
                  key={index}
                  className={`transcript-item ${item.role}`}
                  style={{ opacity: item.isPartial ? 0.7 : 1 }}
                >
                  <strong>{item.role === 'user' ? 'You' : 'AI'}:</strong> {item.text}
                  {item.isPartial && <span style={{ marginLeft: '5px', opacity: 0.5 }}>...</span>}
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

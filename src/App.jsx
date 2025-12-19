import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [isConnected, setIsConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [transcript, setTranscript] = useState([])
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('disconnected')

  const wsRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)
  const playbackAudioContextRef = useRef(null)

  // Connect to OpenAI Realtime API
  const connect = async () => {
    if (!apiKey) {
      setError('Please enter your OpenAI API key')
      return
    }

    try {
      setConnectionStatus('connecting')
      setError('')

      const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01'
      const ws = new WebSocket(url, [
        'realtime',
        `openai-insecure-api-key.${apiKey}`,
        'openai-beta.realtime-v1'
      ])

      ws.onopen = () => {
        console.log('Connected to OpenAI Realtime API')
        setIsConnected(true)
        setConnectionStatus('connected')
        
        // Send session update to configure the session
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: 'You are a helpful AI assistant. Respond to the user in a conversational manner.',
            voice: 'alloy',
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
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        console.log('Received:', data.type, data)

        switch (data.type) {
          case 'conversation.item.created':
            if (data.item.type === 'message') {
              const role = data.item.role
              const content = data.item.content?.[0]
              if (content) {
                if (content.type === 'text') {
                  addTranscript(role, content.text)
                } else if (content.type === 'audio') {
                  console.log('Audio response received')
                }
              }
            }
            break

          case 'response.audio.delta':
            // Handle audio delta - this is the actual audio response
            if (data.delta) {
              playAudioDelta(data.delta)
            }
            break

          case 'conversation.item.input_audio_transcription.completed':
            // User's speech was transcribed
            if (data.transcript) {
              addTranscript('user', data.transcript)
            }
            break

          case 'response.text.delta':
            // Text response delta
            console.log('Text delta:', data.delta)
            break

          case 'response.done':
            console.log('Response completed')
            break

          case 'error':
            console.error('API Error:', data.error)
            setError(`API Error: ${data.error.message}`)
            break
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('Connection error. Please check your API key and try again.')
        setConnectionStatus('disconnected')
      }

      ws.onclose = () => {
        console.log('Disconnected from OpenAI Realtime API')
        setIsConnected(false)
        setConnectionStatus('disconnected')
        stopRecording()
      }

      wsRef.current = ws
    } catch (err) {
      console.error('Connection error:', err)
      setError(`Failed to connect: ${err.message}`)
      setConnectionStatus('disconnected')
    }
  }

  // Disconnect from the API
  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    stopRecording()
    setIsConnected(false)
    setConnectionStatus('disconnected')
  }

  // Start recording audio
  const startRecording = async () => {
    if (!isConnected) {
      setError('Please connect to the API first')
      return
    }

    try {
      setError('')
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true
        } 
      })
      
      mediaStreamRef.current = stream
      const audioContext = new AudioContext({ sampleRate: 24000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      
      processor.onaudioprocess = (e) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0)
          
          // Convert Float32Array to Int16Array (PCM16)
          const pcm16 = new Int16Array(inputData.length)
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]))
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }
          
          // Convert to base64
          const base64 = arrayBufferToBase64(pcm16.buffer)
          
          // Send audio data to the API
          wsRef.current.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64
          }))
        }
      }

      source.connect(processor)
      processor.connect(audioContext.destination)
      processorRef.current = processor

      setIsRecording(true)
    } catch (err) {
      console.error('Error accessing microphone:', err)
      setError('Failed to access microphone. Please grant permission.')
    }
  }

  // Stop recording audio
  const stopRecording = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    setIsRecording(false)

    // Commit the audio buffer and request a response
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.commit'
      }))

      wsRef.current.send(JSON.stringify({
        type: 'response.create'
      }))
    }
  }

  // Helper function to convert ArrayBuffer to base64
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  // Helper function to play audio delta
  const playAudioDelta = (base64Audio) => {
    try {
      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64Audio)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Reuse or create AudioContext for playback
      if (!playbackAudioContextRef.current || playbackAudioContextRef.current.state === 'closed') {
        playbackAudioContextRef.current = new AudioContext({ sampleRate: 24000 })
      }
      const audioContext = playbackAudioContextRef.current
      
      const audioBuffer = audioContext.createBuffer(1, bytes.length / 2, 24000)
      const channelData = audioBuffer.getChannelData(0)

      // Convert Int16 to Float32 (little-endian byte order)
      for (let i = 0; i < channelData.length; i++) {
        const int16 = bytes[i * 2] | (bytes[i * 2 + 1] << 8)
        // Convert to signed int16 if needed
        const signedInt16 = int16 > 0x7FFF ? int16 - 0x10000 : int16
        channelData[i] = signedInt16 / (signedInt16 < 0 ? 0x8000 : 0x7FFF)
      }

      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.start()
    } catch (err) {
      console.error('Error playing audio:', err)
    }
  }

  // Add message to transcript
  const addTranscript = (role, text) => {
    setTranscript(prev => [...prev, { role, text, timestamp: new Date().toLocaleTimeString() }])
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
      if (playbackAudioContextRef.current) {
        playbackAudioContextRef.current.close()
      }
    }
  }, [])

  return (
    <div className="App">
      <h1>🎙️ AI Voice Agent Tester</h1>
      <p>Connect to ChatGPT Realtime API and interact with voice</p>

      <div className="voice-panel">
        {!isConnected && (
          <div>
            <h3>Setup</h3>
            <input
              type="password"
              className="api-key-input"
              placeholder="Enter your OpenAI API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button onClick={connect}>Connect to API</button>
          </div>
        )}

        {isConnected && (
          <>
            <div className={`status ${connectionStatus}`}>
              Status: {connectionStatus === 'connected' ? '🟢 Connected' : '🔴 Disconnected'}
            </div>

            <div className="controls">
              <button 
                className={`mic-button ${isRecording ? 'recording' : ''}`}
                onClick={isRecording ? stopRecording : startRecording}
                title={isRecording ? 'Stop Recording' : 'Start Recording'}
              >
                {isRecording ? '⏹️' : '🎤'}
              </button>
            </div>

            <div className="button-group">
              <button onClick={disconnect}>Disconnect</button>
            </div>

            <div className="transcript">
              <h4>Conversation</h4>
              {transcript.length === 0 && (
                <p style={{ color: '#888', textAlign: 'center' }}>
                  Click the microphone to start talking...
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

        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}
      </div>

      <div style={{ marginTop: '2rem', fontSize: '0.9em', opacity: 0.7 }}>
        <p>
          To use this app, you need an OpenAI API key with access to the Realtime API.
          <br />
          Get your API key from{' '}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
            OpenAI Platform
          </a>
        </p>
      </div>
    </div>
  )
}

export default App

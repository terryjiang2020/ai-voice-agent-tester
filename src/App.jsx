import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [isConnected, setIsConnected] = useState(false)
  const [transcript, setTranscript] = useState([])
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [orderInfo, setOrderInfo] = useState({ items: '', name: '', phone: '' })

  const peerConnectionRef = useRef(null)
  const dataChannelRef = useRef(null)
  const audioElementRef = useRef(null)

  // Connect to OpenAI Realtime API using WebRTC
  const connect = async () => {
    try {
      setConnectionStatus('connecting')
      setError('')

      // Step 1: Get ephemeral token from our server
      console.log('Fetching ephemeral token from server...')
      const tokenResponse = await fetch('http://localhost:3000/token')
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

        switch (event.type) {
          case 'conversation.item.created':
            if (event.item?.type === 'message') {
              const role = event.item.role
              const content = event.item.content?.[0]
              if (content && content.type === 'text') {
                addTranscript(role, content.text)
              }
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

  // Add message to transcript & extract order info
  const addTranscript = (role, text) => {
    setTranscript(prev => [...prev, { role, text, timestamp: new Date().toLocaleTimeString() }])
    if (role === 'user' || role === 'assistant' || role === 'AI') {
      // 简单关键词提取（可根据实际AI回复格式优化）
      let items = orderInfo.items
      let name = orderInfo.name
      let phone = orderInfo.phone
      // 菜品
      const itemMatch = text.match(/(点了|选择了|菜品|订单|order|items?[:：]?)([\w\W]{2,40}?)(?=，|。|,|\n|$)/)
      if (itemMatch && itemMatch[2]) items = itemMatch[2].trim()
      // 姓名
      const nameMatch = text.match(/(姓名|name|order for|顾客名|名字)[:：]?([\w\u4e00-\u9fa5]{2,20})/i)
      if (nameMatch && nameMatch[2]) name = nameMatch[2].trim()
      // 电话
      const phoneMatch = text.match(/(电话|phone|number|手机号|联系方式)[:：]?([0-9\-\+]{6,20})/i)
      if (phoneMatch && phoneMatch[2]) phone = phoneMatch[2].trim()
      // 直接手机号
      const phoneDirect = text.match(/([0-9\-\+]{8,20})/)
      if (!phone && phoneDirect) phone = phoneDirect[1]
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
      <p>Connect to ChatGPT Realtime API via WebRTC</p>

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

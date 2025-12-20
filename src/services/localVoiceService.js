/**
 * 本地语音服务客户端
 * 连接到本地 Python 后端的 WebSocket 服务
 */

export class LocalVoiceService {
  constructor() {
    this.ws = null
    this.audioContext = null
    this.audioQueue = []
    this.isPlaying = false
    this.nextPlayTime = 0
    
    // 音频采集
    this.mediaStream = null
    this.audioWorkletNode = null
    
    // 事件回调
    this.onTranscript = null
    this.onLLMDelta = null
    this.onLLMDone = null
    this.onTTSDone = null
    this.onError = null
    this.onConnectionChange = null
  }

  /**
   * 连接到本地服务
   */
  async connect(url = 'ws://localhost:8000/ws') {
    try {
      console.log(`Connecting to local service: ${url}`)
      
      // 创建 WebSocket 连接
      this.ws = new WebSocket(url)
      
      this.ws.onopen = () => {
        console.log('✅ Connected to local service')
        this.onConnectionChange?.('connected')
      }
      
      this.ws.onclose = () => {
        console.log('Disconnected from local service')
        this.onConnectionChange?.('disconnected')
      }
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.onError?.(error)
      }
      
      this.ws.onmessage = (event) => {
        this.handleMessage(event)
      }
      
      // 初始化音频上下文
      this.audioContext = new AudioContext({ sampleRate: 24000 })
      
      // 等待连接建立
      await this.waitForConnection()
      
      // 启动麦克风
      await this.startMicrophone()
      
    } catch (error) {
      console.error('Connection error:', error)
      this.onError?.(error)
      throw error
    }
  }

  /**
   * 等待 WebSocket 连接
   */
  waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, 10000)
      
      const check = () => {
        if (this.ws.readyState === WebSocket.OPEN) {
          clearTimeout(timeout)
          resolve()
        } else if (this.ws.readyState === WebSocket.CLOSED) {
          clearTimeout(timeout)
          reject(new Error('Connection closed'))
        } else {
          setTimeout(check, 100)
        }
      }
      
      check()
    })
  }

  /**
   * 启动麦克风采集
   */
  async startMicrophone() {
    try {
      console.log('Starting microphone...')
      
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
          channelCount: 1
        }
      })
      
      // 创建音频处理节点
      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      
      // 使用 ScriptProcessor (兼容性更好) 或 AudioWorklet
      await this.setupAudioProcessor(source)
      
      console.log('✅ Microphone started')
      
    } catch (error) {
      console.error('Microphone error:', error)
      throw error
    }
  }

  /**
   * 设置音频处理器
   */
  async setupAudioProcessor(source) {
    // 使用 ScriptProcessorNode (将来会被 AudioWorklet 替代)
    const bufferSize = 4096
    const processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1)
    
    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0)
      
      // 转换为 Int16 PCM
      const int16Data = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]))
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }
      
      // 发送音频数据到服务器
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(int16Data.buffer)
      }
    }
    
    source.connect(processor)
    processor.connect(this.audioContext.destination)
    
    this.audioProcessor = processor
  }

  /**
   * 处理服务器消息
   */
  handleMessage(event) {
    // 二进制数据 (TTS 音频)
    if (event.data instanceof ArrayBuffer) {
      this.handleAudioData(event.data)
      return
    }
    
    // JSON 消息
    if (typeof event.data === 'string') {
      try {
        const message = JSON.parse(event.data)
        this.handleJSONMessage(message)
      } catch (error) {
        console.error('Failed to parse message:', error)
      }
    }
  }

  /**
   * 处理 JSON 消息
   */
  handleJSONMessage(message) {
    console.log('Received message:', message.type)
    
    switch (message.type) {
      case 'session.created':
        console.log('Session created:', message.session_id)
        break
        
      case 'asr.transcript':
        // ASR 识别结果
        this.onTranscript?.({
          text: message.text,
          isFinal: message.is_final
        })
        break
        
      case 'llm.delta':
        // LLM 文本流
        this.onLLMDelta?.(message.text)
        break
        
      case 'llm.done':
        // LLM 完成
        this.onLLMDone?.(message.text)
        break
        
      case 'tts.done':
        // TTS 完成
        this.onTTSDone?.()
        break
        
      case 'error':
        console.error('Server error:', message.message)
        this.onError?.(new Error(message.message))
        break
        
      default:
        console.log('Unknown message type:', message.type)
    }
  }

  /**
   * 处理音频数据 (TTS 输出)
   */
  handleAudioData(arrayBuffer) {
    try {
      // 转换为 Float32
      const int16Data = new Int16Array(arrayBuffer)
      const float32Data = new Float32Array(int16Data.length)
      
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0
      }
      
      // 添加到播放队列
      this.audioQueue.push(float32Data)
      
      // 开始播放
      if (!this.isPlaying) {
        this.playAudioQueue()
      }
      
    } catch (error) {
      console.error('Audio processing error:', error)
    }
  }

  /**
   * 播放音频队列 (无缝衔接)
   */
  playAudioQueue() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false
      return
    }
    
    this.isPlaying = true
    const float32 = this.audioQueue.shift()
    
    // 创建音频缓冲区
    const audioBuffer = this.audioContext.createBuffer(
      1,
      float32.length,
      this.audioContext.sampleRate
    )
    audioBuffer.getChannelData(0).set(float32)
    
    const source = this.audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.audioContext.destination)
    
    // 计算播放时间 (无缝衔接)
    const currentTime = this.audioContext.currentTime
    const startTime = Math.max(currentTime, this.nextPlayTime)
    
    source.start(startTime)
    this.nextPlayTime = startTime + audioBuffer.duration
    
    // 播放下一个
    source.onended = () => {
      this.playAudioQueue()
    }
  }

  /**
   * 发送文本消息 (跳过 ASR)
   */
  sendText(text) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'input_text',
        text: text
      }))
    }
  }

  /**
   * 更新会话配置
   */
  updateSession(config) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'session.update',
        session: config
      }))
    }
  }

  /**
   * 取消当前生成
   */
  cancel() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'cancel'
      }))
    }
    
    // 清空音频队列
    this.audioQueue = []
    this.isPlaying = false
  }

  /**
   * 断开连接
   */
  disconnect() {
    console.log('Disconnecting...')
    
    // 停止麦克风
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }
    
    // 停止音频处理器
    if (this.audioProcessor) {
      this.audioProcessor.disconnect()
      this.audioProcessor = null
    }
    
    // 关闭音频上下文
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    
    // 关闭 WebSocket
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    
    // 清空队列
    this.audioQueue = []
    this.isPlaying = false
    
    this.onConnectionChange?.('disconnected')
  }
}

export default LocalVoiceService

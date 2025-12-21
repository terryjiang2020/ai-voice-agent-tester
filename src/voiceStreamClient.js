export class VoiceStreamWebSocketClient {
  constructor() {
    this.ws = new WebSocket('wss://devserver.elasticdash.com/ws/voice/stream');
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => console.log('WebSocket connected');
    this.ws.onmessage = (event) => this.handleMessage(event);
    this.ws.onclose = () => console.log('WebSocket disconnected');
  }

  sendAudioChunk(audioChunk) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(audioChunk);
    }
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    switch (message.type) {
      case 'asr.partial':
        console.log('Partial ASR:', message.text);
        break;
      case 'asr.final':
        console.log('Final ASR:', message.text);
        break;
      case 'llm.partial':
        console.log('Partial LLM:', message.text);
        break;
      case 'llm.final':
        console.log('Final LLM:', message.text);
        break;
      case 'tts.chunk':
        console.log('TTS chunk received');
        break;
      case 'done':
        console.log('Stream complete');
        break;
      case 'error':
        console.error('Error:', message.message);
        break;
    }
  }
}
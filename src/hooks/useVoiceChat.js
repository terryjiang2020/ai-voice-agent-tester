// Frontend voice chat hook aligned with backend /ws/voice
// Uses WebSocket JSON messages and MediaRecorder for mic input

export function useVoiceChat(wsUrl = import.meta.env.VITE_BACKEND_WS || "ws://localhost:8000/ws/voice") {
  let ws;
  let mediaRecorder;
  let audioContext;
  let sourceNode;
  let decodedQueue = [];
  let isRecording = false;

  const connect = () => {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => console.log("[useVoiceChat] connected", wsUrl);
    ws.onclose = () => console.log("[useVoiceChat] disconnected");
    ws.onerror = (e) => console.error("[useVoiceChat] error", e);
    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "asr") {
          console.log("ASR:", msg.content?.text);
        } else if (msg.type === "llm") {
          // Streaming partials and final
          console.log("LLM:", msg.content?.text, "partial:", msg.content?.partial);
        } else if (msg.type === "tts") {
          const b64 = msg.content?.audio;
          if (b64) {
            const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const audioBuffer = await decodePcm16ToBuffer(bytes);
            decodedQueue.push(audioBuffer);
            playQueue();
          }
        } else if (msg.type === "control") {
          console.log("CONTROL:", msg.content?.message);
        } else if (msg.type === "error") {
          console.error("BACKEND ERROR:", msg.content?.message);
        }
      } catch (_) {
        // Non-JSON: ignore
      }
    };
  };

  const startRecording = async () => {
    if (isRecording) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

    mediaRecorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0) {
        const buf = await e.data.arrayBuffer();
        ws?.send(buf);
      }
    };

    mediaRecorder.start(250); // small chunks
    isRecording = true;
  };

  const stopRecording = () => {
    if (!isRecording) return;
    mediaRecorder?.stop();
    isRecording = false;
  };

  const sendText = (text) => {
    ws?.send(JSON.stringify({ type: "input_text", text }));
  };

  const clear = () => {
    ws?.send(JSON.stringify({ command: "clear" }));
  };

  async function decodePcm16ToBuffer(bytes) {
    // backend sends raw PCM16 mono 16k; wrap to WAV header for decoding
    const wavBytes = pcm16ToWav(bytes, 16000, 1);
    const blob = new Blob([wavBytes], { type: "audio/wav" });
    const arrayBuffer = await blob.arrayBuffer();
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    return audioContext.decodeAudioData(arrayBuffer);
  }

  function pcm16ToWav(pcmBytes, sampleRate, channels) {
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmBytes.length;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");

    // fmt chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // PCM
    view.setUint16(20, 1, true); // format = PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // bits per sample

    // data chunk
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    const out = new Uint8Array(buffer);
    out.set(pcmBytes, 44);
    return out;
  }

  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  function playQueue() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (decodedQueue.length === 0) return;

    const next = decodedQueue.shift();
    const bufferSource = audioContext.createBufferSource();
    bufferSource.buffer = next;
    bufferSource.connect(audioContext.destination);
    bufferSource.onended = () => playQueue();
    bufferSource.start();
  }

  return {
    connect,
    startRecording,
    stopRecording,
    sendText,
    clear,
  };
}

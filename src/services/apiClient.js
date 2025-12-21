// Simple REST API client for backend endpoints

const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export async function checkHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.json();
}

export async function transcribeAudio(base64Audio) {
  const res = await fetch(`${BASE_URL}/api/asr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio_data: base64Audio }),
  });
  return res.json();
}

export async function getLLMResponse(messages, temperature, max_tokens) {
  const res = await fetch(`${BASE_URL}/api/llm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, temperature, max_tokens }),
  });
  return res.json();
}

export async function textToSpeech(text, speaker) {
  const res = await fetch(`${BASE_URL}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speaker }),
  });
  return res.json();
}

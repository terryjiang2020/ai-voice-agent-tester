import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { restaurantInfo, formatter } from './constants.js';
import { WebSocketServer } from 'ws';

dotenv.config();

const app = express();
app.use(cors());

const sessionConfig = {
  session: {
    type: "realtime",
    model: "gpt-realtime",
    instructions: `
You are a voice order-taking AI agent for Chunky Chook (Chicken & Chips) in Auckland.
Your job is to take accurate pickup orders quickly, confirm details, and avoid mistakes.

${restaurantInfo}

${formatter}
`.trim(),
    audio: {
      output: { voice: "shimmer" },
    },
  },
};

// Endpoint to generate ephemeral API keys for WebRTC (OpenAI)
app.get('/token', async (req, res) => {
  const model = req.query.model || 'openai';
  
  try {
    if (model === 'grok') {
      // Grok uses direct WebSocket, return API key info
      const response = await fetch(
        'https://api.x.ai/v1/realtime/client_secrets',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.VITE_XAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ expires_after: { seconds: 300 } }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`xAI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      res.json(data);
    } else {
      // OpenAI WebRTC
      const response = await fetch(
        'https://api.openai.com/v1/realtime/client_secrets',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.VITE_OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sessionConfig),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token', details: error.message });
  }
});

// Create WebSocket server
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', (message) => {
    console.log('Received audio chunk');

    // Simulate incremental ASR events
    ws.send(JSON.stringify({ type: 'asr.partial', text: '部分转录文本' }));
    ws.send(JSON.stringify({ type: 'asr.final', text: '完整转录文本' }));

    // Simulate end of stream
    ws.send(JSON.stringify({ type: 'done' }));
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

console.log('WebSocket server running on ws://localhost:8080');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Ephemeral token server running on http://localhost:${PORT}`);
  console.log(`   Access /token to generate ephemeral keys for WebRTC`);
});

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());

const sessionConfig = {
  session: {
    type: 'realtime',
    model: 'gpt-realtime',
    instructions: 'You are a helpful AI assistant. Speak at a faster pace with concise responses.',
    audio: {
      output: {
        voice: 'alloy',
      },
    },
  },
};

// Endpoint to generate ephemeral API keys for WebRTC
app.get('/token', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Ephemeral token server running on http://localhost:${PORT}`);
  console.log(`   Access /token to generate ephemeral keys for WebRTC`);
});

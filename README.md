# AI Voice Agent Tester

A React-based application for testing voice interactions with ChatGPT's Realtime API.

## Features

- 🎤 **Voice Input**: Record your voice directly in the browser
- 🤖 **Real-time AI Responses**: Connect to OpenAI's GPT-4 Realtime API
- 🔊 **Audio Playback**: Hear AI responses in voice
- 📝 **Conversation Transcript**: View the conversation history
- 🔒 **Secure**: API key is stored locally and never sent to any third party

## Prerequisites

- Node.js 18+ and npm
- OpenAI API key with access to the Realtime API
  - Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
  - Ensure your account has access to the GPT-4 Realtime API (currently in beta)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/terryjiang2020/ai-voice-agent-tester.git
cd ai-voice-agent-tester
```

2. Install dependencies:
```bash
npm install
```

3. (Optional) Create a `.env` file:
```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

## Usage

1. Start the development server:
```bash
npm run dev
```

2. Open your browser and navigate to `http://localhost:5173`

3. Enter your OpenAI API key in the input field (or set it in `.env`)

4. Click "Connect to API" to establish a connection

5. Click the microphone button to start recording your voice

6. Speak your message and click the stop button when done

7. The AI will process your input and respond with voice and text

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Preview Production Build

```bash
npm run preview
```

## Technical Details

- **Framework**: React 18 with Vite
- **API**: OpenAI Realtime API (WebSocket-based)
- **Audio Format**: PCM16 at 24kHz
- **Voice Detection**: Server-side VAD (Voice Activity Detection)

## Troubleshooting

### Microphone Permission
If the app cannot access your microphone, check your browser settings to ensure microphone permissions are granted.

### Connection Issues
- Verify your API key is correct and has access to the Realtime API
- Check your internet connection
- Ensure you're using a modern browser (Chrome, Edge, or Safari recommended)

### Audio Issues
- Make sure your browser supports the Web Audio API
- Check your system audio settings
- Try using headphones to avoid feedback

## License

MIT
# AI Voice Agent Tester

A full-stack voice conversation system with local AI models (Fun-ASR + Ollama + CosyVoice) and remote API support (OpenAI/Grok).

## 🎯 Features

- 🎤 **Voice Input**: Real-time speech recognition (Fun-ASR)
- 🤖 **AI Conversation**: Local LLM (Ollama) or Remote API (OpenAI/Grok)
- 🔊 **Voice Output**: Natural speech synthesis (CosyVoice)
- 📝 **Streaming**: Full-duplex streaming conversation
- 🖥️ **Flexible Deployment**: Docker, Local, or EC2 GPU
- 🔒 **Privacy**: 100% local inference option (no data leaves your machine)

## 📦 Deployment Options

### 1. AWS Amplify (Frontend Hosting)
Global CDN hosting for frontend with backend on EC2/ECS.

📖 **[Amplify Setup Guide](./AMPLIFY_SETUP.md)** - Complete Amplify deployment
💡 **Best for**: Production with global users, automatic SSL

```bash
# Deploy frontend to Amplify
# Backend runs on EC2 or use Remote API
# See AMPLIFY_SETUP.md for 3 deployment architectures
```

**Cost**: $5-10/month (frontend) + backend costs

### 2. EC2 GPU (Recommended for Backend)
Full GPU acceleration on AWS EC2 with local models.

📖 **[EC2 Setup Guide](./EC2_SETUP.md)** - Complete installation instructions
📋 **[EC2 Quick Start](./EC2_QUICKSTART.md)** - Fast deployment for configured instances

```bash
# Quick start on EC2
git clone https://github.com/terryjiang2020/ai-voice-agent-tester.git
cd ai-voice-agent-tester
./scripts/start-local.sh
```

**Requirements**: EC2 GPU instance (g4dn.xlarge+), CUDA 11.8+, 50GB+ storage

### 3. Docker (Development/Testing)
Containerized deployment with CPU or GPU support.

📖 **[Docker Deployment Guide](./DEPLOYMENT.md)**

```bash
# Start with Docker Compose
docker-compose up --build
```

**Note**: macOS Docker Desktop does not support GPU access.

### 4. Local Development
Direct installation on your machine.

```bash
# Prerequisites
# - Python 3.10+
# - Node.js 18+
# - Ollama (optional, for local LLM)

# Clone and install
git clone https://github.com/terryjiang2020/ai-voice-agent-tester.git
cd ai-voice-agent-tester

# Install dependencies
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cd ..
npm install

# Configure .env
cp .env.example .env
# Edit .env with your settings

# Start services
cd backend && python server.py &  # Backend
npm run dev  # Frontend
```

---

## 🚀 Quick Start

### Option A: Local Models (Privacy-First)
```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull model
ollama pull qwen3:0.6b

# 3. Configure .env
USE_LOCAL_LLM=1
OLLAMA_MODEL=qwen3:0.6b
ASR_MODEL=iic/SenseVoiceNano

# 4. Start
./scripts/start-local.sh
```

### Option B: Remote API (Easier Setup)
```bash
# 1. Get API key from OpenAI or Grok

# 2. Configure .env
USE_LOCAL_LLM=0
VITE_OPENAI_API_KEY=sk-your-key-here

# 3. Start
npm run dev
```

---

## 🛠️ Configuration

### Environment Variables (.env)

```bash
# === LLM Configuration ===
USE_LOCAL_LLM=1                          # 1=Local Ollama, 0=Remote API
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen3:0.6b                  # or deepseek-r1:1.5b

# === Model Configuration ===
ASR_MODEL=iic/SenseVoiceNano             # Speech recognition
TTS_MODEL=CosyVoice-300M                 # Speech synthesis
USE_CPU=0                                # 0=GPU, 1=CPU

# === Remote API (Optional) ===
VITE_OPENAI_API_KEY=sk-xxx               # OpenAI API key
VITE_XAI_API_KEY=xai-xxx                 # Grok API key

# === Network ===
VITE_BACKEND_WS=ws://localhost:8000/ws   # Backend WebSocket URL
```

---

## 🏗️ Architecture

```
┌─────────────┐
│   Browser   │ Microphone → WebSocket
└──────┬──────┘
       │
       ↓ Audio Stream (PCM)
┌─────────────────────────────────────┐
│      Backend (FastAPI)               │
│  ┌─────────────────────────────┐   │
│  │  Fun-ASR (Speech → Text)    │   │
│  └──────────┬──────────────────┘   │
│             ↓                        │
│  ┌─────────────────────────────┐   │
│  │  Ollama/OpenAI (LLM)        │   │
│  └──────────┬──────────────────┘   │
│             ↓                        │
│  ┌─────────────────────────────┐   │
│  │  CosyVoice (Text → Speech)  │   │
│  └──────────┬──────────────────┘   │
└─────────────┼───────────────────────┘
              ↓ Audio Stream
       ┌──────────────┐
       │  Web Audio   │ Playback
       └──────────────┘
```

---

## 📚 Documentation

### Deployment Guides
- **[Amplify Setup](./AMPLIFY_SETUP.md)** - AWS Amplify frontend hosting (3 architectures)
- **[EC2 Setup Guide](./EC2_SETUP.md)** - Production deployment on AWS EC2 GPU
- **[EC2 Quick Start](./EC2_QUICKSTART.md)** - Fast deployment reference
- **[Docker Deployment](./DEPLOYMENT.md)** - Container deployment guide

### Configuration
- **[Ollama Setup](./OLLAMA_SETUP.md)** - Local LLM configuration
- **[Environment Variables](./.env.example)** - Configuration template

---

## 🎯 Usage

---

## 🎯 Usage

1. **Open the application** in your browser (default: `http://localhost:5173`)

2. **Select model**:
   - **OpenAI Realtime API** - Remote, requires API key
   - **Grok Realtime API** - Remote, requires API key
   - **Local Model** - Local ASR + Ollama + TTS

3. **Connect** by entering API key (remote) or clicking Connect (local)

4. **Click microphone** button to start recording

5. **Speak naturally** - AI will respond in real-time with voice

6. **View transcript** of the conversation

---

## 🔧 Technical Stack

### Backend
- **Framework**: FastAPI + WebSocket
- **ASR**: Fun-ASR (SenseVoiceNano) - Real-time speech recognition
- **LLM**: Ollama (qwen3:0.6b) or OpenAI API
- **TTS**: CosyVoice-300M - Natural voice synthesis
- **Streaming**: Async generators for low-latency

### Frontend
- **Framework**: React 18 + Vite
- **Audio**: Web Audio API + MediaRecorder
- **WebSocket**: Real-time bidirectional communication
- **State**: React hooks

---

## 🐛 Troubleshooting

### Common Issues

#### Microphone Not Working
```bash
# Check browser permissions
# Chrome: Settings → Privacy → Site Settings → Microphone
# Allow microphone access for localhost
```

#### Ollama Connection Failed
```bash
# Check Ollama is running
curl http://localhost:11434/v1/models

# Restart Ollama
pkill ollama
ollama serve
```

#### GPU Not Detected (EC2)
```bash
# Check NVIDIA driver
nvidia-smi

# Check PyTorch CUDA
python -c "import torch; print(torch.cuda.is_available())"

# Set environment
export USE_CPU=0
```

#### CosyVoice Model Not Found
```bash
cd backend
git clone https://www.modelscope.cn/iic/CosyVoice-300M.git pretrained_models/CosyVoice-300M
```

#### Port Already in Use
```bash
# Kill process on port 8000 (backend)
sudo lsof -i :8000
sudo kill -9 <PID>

# Kill process on port 5173 (frontend)
sudo lsof -i :5173
sudo kill -9 <PID>
```

### Performance Issues

#### Slow ASR/TTS
- Use GPU mode: `USE_CPU=0`
- Use smaller models: `ASR_MODEL=iic/SenseVoiceNano`
- Reduce batch size in code

#### High Memory Usage
- Use quantized models
- Reduce concurrent connections
- Monitor with: `nvidia-smi` (GPU) or `htop` (CPU)

---

## 📊 Model Information

### ASR Models
| Model | Size | Speed | Accuracy | Languages |
|-------|------|-------|----------|-----------|
| SenseVoiceNano | 50MB | ⚡⚡⚡ | ⭐⭐⭐ | 中文/英文 |
| SenseVoiceSmall | 200MB | ⚡⚡ | ⭐⭐⭐⭐ | 多语言 |

### LLM Models (Ollama)
| Model | Size | Speed | Quality | Use Case |
|-------|------|-------|---------|----------|
| qwen3:0.6b | 400MB | ⚡⚡⚡ | ⭐⭐⭐ | Real-time chat |
| deepseek-r1:1.5b | 1.1GB | ⚡⚡ | ⭐⭐⭐⭐ | Reasoning |
| qwen2.5:3b | 2GB | ⚡ | ⭐⭐⭐⭐⭐ | High quality |

### TTS Models
| Model | Size | Quality | Speed |
|-------|------|---------|-------|
| CosyVoice-300M | 1GB | ⭐⭐⭐⭐⭐ | ⚡⚡ |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📝 License

MIT

---

## 🔗 Related Projects

- [Fun-ASR](https://github.com/alibaba-damo-academy/FunASR) - Speech recognition
- [CosyVoice](https://github.com/FunAudioLLM/CosyVoice) - Speech synthesis
- [Ollama](https://ollama.com) - Local LLM runtime

---

## 🙏 Acknowledgments

- Alibaba DAMO Academy for Fun-ASR
- FunAudioLLM team for CosyVoice
- Ollama team for local LLM infrastructure
- OpenAI for Realtime API reference
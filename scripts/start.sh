#!/bin/bash
# 快速启动脚本

set -e

echo "🚀 Starting Local Voice Agent Service..."

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker Desktop first."
    echo "   Download: https://www.docker.com/products/docker-desktop/"
    exit 1
fi

# 检查 Ollama (如果使用本地 LLM)
USE_LOCAL_LLM=$(grep "^USE_LOCAL_LLM=" .env 2>/dev/null | cut -d'=' -f2 || echo "1")
if [ "$USE_LOCAL_LLM" = "1" ]; then
    echo ""
    echo "🦙 Checking Ollama service..."
    if ! command -v ollama &> /dev/null; then
        echo "⚠️  Ollama not found. Please install:"
        echo "   curl -fsSL https://ollama.com/install.sh | sh"
        echo ""
        echo "   Or set USE_LOCAL_LLM=0 in .env to use remote API"
        exit 1
    fi
    
    # 检查 Ollama 服务是否运行
    if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "⚠️  Ollama service not running. Starting..."
        echo "   Please run in another terminal: ollama serve"
        echo ""
        read -p "   Press Enter when Ollama is running..."
    fi
    
    # 检查模型
    OLLAMA_MODEL=$(grep "^OLLAMA_MODEL=" .env 2>/dev/null | cut -d'=' -f2 || echo "qwen3:0.6b")
    echo "   Checking model: $OLLAMA_MODEL"
    if ! ollama list | grep -q "$OLLAMA_MODEL"; then
        echo "⚠️  Model $OLLAMA_MODEL not found."
        echo "   Downloading (this may take a few minutes)..."
        ollama pull "$OLLAMA_MODEL"
    fi
    
    echo "✅ Ollama ready: $OLLAMA_MODEL"
fi

# 检查 .env
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp .env.example .env
    echo "📝 Please review .env configuration"
fi

# 检查 TTS/ASR 模型
if [ ! -d "backend/pretrained_models/CosyVoice-300M" ]; then
    echo "⚠️  CosyVoice model not found."
    echo "   Run: ./scripts/download_models.sh"
    exit 1
fi

# 启动服务
echo ""
echo "🐳 Starting Docker Compose..."
docker compose up --build

# 或使用后台模式:
# docker compose up -d --build
# echo "✅ Services started in background"
# echo "   Frontend: http://localhost:5173"
# echo "   Backend: ws://localhost:8000/ws"
# echo "   Health: http://localhost:8000/health"
# echo ""
# echo "   View logs: docker compose logs -f"
# echo "   Stop: docker compose down"

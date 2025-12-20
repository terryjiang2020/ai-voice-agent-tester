#!/bin/bash
set -e

echo "🚀 Starting Local Voice Agent (EC2 GPU Mode)..."
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found. Please install Python 3.10+"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

# 检查 Ollama
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama not found. Please install Ollama first:"
    echo "   curl -fsSL https://ollama.com/install.sh | sh"
    exit 1
fi

# 检查 Ollama 服务
echo "🦙 Checking Ollama service..."
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
echo ""

# 检查 .env
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp .env.example .env
    echo "✅ Created .env - Please edit with your API keys if needed"
fi

# 检查 Python 依赖
echo "📦 Checking Python dependencies..."
cd backend
if [ ! -d "venv" ]; then
    echo "   Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

echo "✅ Python environment ready"
echo ""

# 检查 CUDA
if command -v nvidia-smi &> /dev/null; then
    echo "🎮 GPU detected:"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
    echo ""
fi

# 检查 CosyVoice 模型
if [ ! -d "pretrained_models/CosyVoice-300M" ]; then
    echo "⚠️  CosyVoice model not found at pretrained_models/CosyVoice-300M"
    echo ""
    echo "Please download the model:"
    echo "   cd backend"
    echo "   git clone https://www.modelscope.cn/iic/CosyVoice-300M.git pretrained_models/CosyVoice-300M"
    echo ""
    read -p "Press Enter to continue (or Ctrl+C to exit)..."
fi

# 启动后端
echo "🐍 Starting Python backend..."
python server.py &
BACKEND_PID=$!

cd ..

# 等待后端启动
echo "⏳ Waiting for backend to initialize..."
for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ Backend ready"
        break
    fi
    sleep 1
done

# 检查 Node 依赖
echo "📦 Checking Node.js dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
fi

# 启动前端
echo "⚡ Starting frontend..."
npm run dev

# 清理
trap "kill $BACKEND_PID 2>/dev/null" EXIT

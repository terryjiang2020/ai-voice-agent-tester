#!/bin/bash
# 模型下载脚本

set -e

echo "🚀 Downloading AI models for local voice service..."

# 创建模型目录
mkdir -p backend/pretrained_models
cd backend/pretrained_models

# 下载 CosyVoice 300M (推荐开始使用)
echo ""
echo "📦 Downloading CosyVoice-300M model..."
if [ ! -d "CosyVoice-300M" ]; then
    git clone https://www.modelscope.cn/iic/CosyVoice-300M.git
    echo "✅ CosyVoice-300M downloaded"
else
    echo "⏭️  CosyVoice-300M already exists, skipping"
fi

# 提示用户可选模型
echo ""
echo "📝 Optional: Download higher quality models"
echo ""
echo "   For better quality (requires 4GB VRAM):"
echo "   git clone https://www.modelscope.cn/iic/CosyVoice-0.5B.git"
echo ""
echo "   For best quality (requires 8GB VRAM):"
echo "   git clone https://www.modelscope.cn/iic/CosyVoice-1B.git"
echo ""

cd ../..

echo ""
echo "✅ Model download complete!"
echo ""
echo "📌 Note: FunASR model will be automatically downloaded on first run"
echo "   Location: ~/.cache/modelscope/"
echo ""
echo "🚀 Next steps:"
echo "   1. Copy .env.example to .env and configure API keys"
echo "   2. Run: docker compose up --build"
echo ""

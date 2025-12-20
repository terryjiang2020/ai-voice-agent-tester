# 使用轻量级 Python 镜像 (CPU 版本)
# 如果有 GPU 需求，可以改用: nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04
FROM python:3.10-slim

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    git \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY requirements.txt .

# 安装 Python 依赖
# 使用清华镜像加速（中国用户）
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制应用代码
COPY . .

# 暴露 WebSocket 端口
EXPOSE 8000

# 启动命令
CMD ["python3", "server.py"]

# ============================================
# 🐳 Docker 镜像选择指南
# ============================================
# 
# 1️⃣ 有 NVIDIA GPU (推荐)
#    FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04
#    - 支持 CUDA 加速
#    - TTS/ASR 推理速度快 (实时率 >1.0)
#    - 需要安装 NVIDIA Docker Runtime
#    - 运行: docker compose up
#
# 2️⃣ 仅 CPU (备选)
#    FROM python:3.10-slim
#    - 无需 GPU
#    - 推理速度慢 (实时率 ~0.3-0.5)
#    - 适合测试/低负载场景
#    - 去掉 docker-compose.yml 中的 deploy.resources
#
# 3️⃣ Apple Silicon Mac (M1/M2/M3)
#    FROM python:3.10-slim
#    - Docker Desktop 不支持 GPU 透传
#    - 建议直接本地 Python 环境运行
#    - 可使用 MPS (Metal Performance Shaders) 加速
#    - 运行: python3 server.py
#
# ============================================

# 🎯 快速开始指南

## 5 分钟快速部署本地语音对话系统

### 📋 前置条件

✅ Docker Desktop 已安装
✅ Ollama 已安装并运行 (用于本地 LLM)
   - Mac/Linux: `curl -fsSL https://ollama.com/install.sh | sh`
   - Windows: https://ollama.com/download

---

## 🚀 四步启动

### 0️⃣ 启动 Ollama 并下载模型

```bash
# 启动 Ollama 服务
ollama serve

# 新终端: 下载推荐模型 (约 400MB)
ollama pull qwen2.5:0.5b
```

### 1️⃣ 配置环境变量

```bash
# 复制配置模板
cp .env.example .env

# 编辑 .env
# Ollama 配置 (默认已配置好)
USE_LOCAL_LLM=1
OLLAMA_BASE_URL=http://host.docker.internal:11434/v1
OLLAMA_MODEL=qwen2.5:0.5b

# 如果需要远程 API，设置:
# USE_LOCAL_LLM=0
# VITE_OPENAI_API_KEY=sk-your-key-here
# LLM_API_KEY=sk-your-key-here
```

### 2️⃣ 下载 TTS/ASR 模型

```bash
# 运行模型下载脚本 (约 600MB)
./scripts/download_models.sh
```

### 3️⃣ 启动服务

```bash
# 确保 Ollama 正在运行
# 新终端检查: curl http://localhost:11434/api/tags

# 一键启动 (Docker)
./scripts/start.sh

# 或手动启动
docker compose up --build
```

**访问**: http://localhost:5173

---
1. 打开浏览器访问 http://localhost:5173
2. 选择 "🏠 Local Model (Fun-ASR + CosyVoice)"
3. 点击 "Connect" 按钮
4. 允许麦克风权限
5. 开始说话，系统会：
   - 实时识别你的语音 (Fun-ASR)
   - 调用本地 LLM 生成回复 (Ollama Qwen 2.5)
   - 流式合成语音播放 (CosyVoice)

**✅ 完全本地化，无需任何远程 API！** | 下载命令 |
|------|------|------|------|----------|
| **qwen2.5:0.5b** ⭐ | 400MB | 极快 | 优秀 | `ollama pull qwen2.5:0.5b` |
| qwen2.5:1.5b | 1GB | 快 | 更好 | `ollama pull qwen2.5:1.5b` |
| qwen2.5:3b | 2GB | 中等 | 最好 | `ollama pull qwen2.5:3b` |

### 切换模型

编辑 `.env`:
```bash
OLLAMA_MODEL=qwen2.5:1.5b  # 使用 1.5B 模型
```

**详细配置**: 查看 [OLLAMA_SETUP.md](OLLAMA_SETUP.md)

---

## 🎛️ 使用方法

1. 打开浏览器访问 http://localhost:5173
2. 选择 "🏠 Local Model (Fun-ASR + CosyVoice)"
3. 点击 "Connect" 按钮
4. 允许麦克风权限
5. 开始说话，系统会：
   - 实时识别你的语音 (ASR)
   - 调用 LLM 生成回复
   - 流式合成语音播放 (TTS)

---

## 🐳 Docker Image 说明

### 推荐配置

**有 NVIDIA GPU (推荐):**
```yaml
# docker-compose.yml 已配置
# 使用 nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04
```
- ✅ GPU 加速，实时响应
- ⚠️ 需要安装 NVIDIA Docker Runtime

**仅 CPU (备选):**
```yaml
# 修改 docker-compose.yml
# 1. 注释掉 deploy.resources 部分
# 2. 修改 Dockerfile:
#    FROM python:3.10-slim
# 3. 添加环境变量 USE_CPU=1
```
- ✅ 无需 GPU
- ⚠️ 推理速度慢 (延迟 2-3 秒)

**Apple Silicon Mac:**
```bash
# Docker 不支持 GPU 透传
# 建议直接本地 Python 运行
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
python backend/server.py
```
- ✅ 自动使用 MPS 加速

---

## 📦 项目如何在 Docker 中运行

### 架构概览

```
┌─────────────────────────────────────┐
│   Docker Container: frontend        │
│   Image: node:20-alpine             │
│   - 运行 Vite 开发服务器 (5173)    │
│   - 运行 Express token 服务 (3000) │
└──────────────┬──────────────────────┘
               │ 通过 Docker 网络连接
┌──────────────▼──────────────────────┐
│   Docker Container: backend         │
│   Image: nvidia/cuda:11.8 或        │
│          python:3.10-slim           │
│   - FastAPI WebSocket 服务 (8000)  │
│   - Fun-ASR 语音识别               │
│   - CosyVoice TTS 合成             │
│   - OpenAI LLM 接口                │
└─────────────────────────────────────┘
```

### 数据流

```
浏览器 → http://localhost:5173 (前端)
   ↓
   WebSocket → ws://localhost:8000/ws (后端)
   ↓
   麦克风音频 → Fun-ASR → 文本
   ↓
   文本 → OpenAI LLM → 回复文本
   ↓
   回复文本 → CosyVoice → 音频流
   ↓
   音频流 → 浏览器播放
```

### 文件挂载

```yaml
volumes:
  - ./backend:/app              # 后端代码热重载
  - model-cache:/root/.cache    # 模型文件持久化
  - .:/app                      # 前端代码
  - /app/node_modules           # 容器内 node_modules
```

---

## 🔧 常见问题

### Q1: GPU 怎么在 Docker 中使用？

**A:** 使用 NVIDIA Docker Runtime

```bash
# Linux 安装
sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker

# 验证
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi

# docker-compose.yml 配置
services:
  backend:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
### Q2: Mac 能用 GPU 加速吗？

**A:** Docker Desktop 不支持 GPU 透传

- ❌ Docker 中无法使用 GPU
- ✅ 直接本地 Python 运行可使用 MPS
- ✅ PyTorch 自动检测并使用 MPS
- ✅ Ollama 自动使用 Metal 加速

```python
# 自动使用 MPS (Metal Performance Shaders)
device = "mps" if torch.backends.mps.is_available() else "cpu"
```

### Q3: Ollama 连接失败怎么办？

**A:** 检查 Ollama 服务状态

```bash
# 检查服务
curl http://localhost:11434/api/tags

**优化建议**:
- 使用更小的模型 (CosyVoice-300M)
- Ollama 使用 qwen2.5:0.5b (最快)
- 降低音频采样率
- 考虑云 GPU 服务 (AWS/GCP)

### Q5: 模型文件太大怎么办？
# 应该看到: ✅ Local LLM initialized: qwen2.5:0.5b
```

**Docker 连接配置**:
```yaml
volumes:
  - model-cache:/root/.cache  # 持久化缓存
```

- CosyVoice + FunASR: ~10GB
- Ollama qwen2.5:0.5b: ~400MB
- 后续启动: 直接使用缓存
- 清理缓存: `docker compose down -v`

**Ollama 模型管理**:
```bash
# 查看已下载模型
ollama list

# 删除不用的模型
ollama rm model-name
```

---

## 📚 完整文档

- **Ollama 配置**: [OLLAMA_SETUP.md](OLLAMA_SETUP.md) ⭐ 新增
- **部署指南**: [DEPLOYMENT.md](DEPLOYMENT.md)
docker stats
```

---

## 🛑 停止服务

```bash
# 停止服务
docker compose down

# 停止并删除缓存 (释放磁盘空间)
docker compose down -v

# 清理未使用的 Docker 资源
docker system prune -a
```

---

## 📚 完整文档

- **部署指南**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **项目 README**: [README.md](README.md)
- **计划追踪**: [.temp/plan.md](.temp/plan.md)

---

## 🆘 需要帮助？

**检查清单**:
1. ✅ Docker 正在运行
2. ✅ .env 文件已配置
3. ✅ 模型已下载
4. ✅ 端口未被占用 (5173, 3000, 8000)

**查看日志**:
```bash
docker compose logs -f
```

**健康检查**:
```bash
curl http://localhost:8000/health
```

## 🆘 需要帮助？

**检查清单**:
1. ✅ Docker 正在运行
2. ✅ Ollama 正在运行 (`ollama serve`)
3. ✅ 已下载模型 (`ollama pull qwen2.5:0.5b`)
4. ✅ .env 文件已配置
5. ✅ TTS/ASR 模型已下载
6. ✅ 端口未被占用 (5173, 3000, 8000, 11434)

**查看日志**:
```bash
# 后端日志
docker compose logs -f backend

# Ollama 测试
curl http://localhost:11434/api/tags

# 健康检查
curl http://localhost:8000/health
```

**快速测试**:
```bash
# 测试 Ollama
ollama run qwen2.5:0.5b "你好"

# 查看资源
docker stats
```

---

## 📊 性能测试

```bash
# 查看健康状态
curl http://localhost:8000/health

# 查看日志
docker compose logs -f backend

# 监控资源
docker stats
```

---

## 🛑 停止服务

```bash
# 停止服务
docker compose down

# 停止 Ollama
# (如果需要) pkill ollama

# 停止并删除缓存 (释放磁盘空间)
docker compose down -v

# 清理未使用的 Docker 资源
docker system prune -a
```
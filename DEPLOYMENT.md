# 🚀 本地语音对话系统部署指南

## 📋 目录
1. [系统要求](#系统要求)
2. [Docker 部署（推荐）](#docker-部署推荐)
3. [本地 Python 部署](#本地-python-部署)
4. [模型下载](#模型下载)
5. [配置说明](#配置说明)
6. [故障排除](#故障排除)

---

## 🖥️ 系统要求

### 最低配置
- **CPU**: 4 核心
- **内存**: 8GB RAM
- **磁盘**: 20GB 可用空间
- **操作系统**: macOS / Linux / Windows (WSL2)

### 推荐配置 (GPU)
- **GPU**: NVIDIA GPU with 8GB+ VRAM
- **CUDA**: 11.8+
- **cuDNN**: 8.x
- **显卡**: RTX 3060 或更高

### 软件依赖
- Docker Desktop 24.0+ (Docker 部署)
- Python 3.10+ (本地部署)
- Node.js 20+ (前端开发)
- Git

---

## 🐳 Docker 部署（推荐）

### 1. 安装 Docker

**macOS:**
```bash
# 下载并安装 Docker Desktop
https://www.docker.com/products/docker-desktop/

# 验证安装
docker --version
docker compose version
```

**Linux (Ubuntu):**
```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安装 NVIDIA Docker (如果有 GPU)
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update
sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env`:
```bash
# OpenAI API (用于 LLM 对话)
VITE_OPENAI_API_KEY=sk-your-openai-api-key

# Grok API (可选)
VITE_XAI_API_KEY=your-xai-api-key

# LLM 配置
LLM_API_KEY=sk-your-openai-api-key
LLM_API_BASE=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini

# 模型配置
ASR_MODEL=iic/SenseVoiceSmall
TTS_MODEL=CosyVoice-300M

# CPU 模式 (如果没有 GPU)
# USE_CPU=1
```

### 3. 下载模型文件

**选项 A: 使用脚本自动下载**
```bash
chmod +x scripts/download_models.sh
./scripts/download_models.sh
```

**选项 B: 手动下载**
```bash
# 创建模型目录
mkdir -p backend/pretrained_models

# 下载 CosyVoice 300M 模型
cd backend/pretrained_models
git clone https://www.modelscope.cn/iic/CosyVoice-300M.git

# FunASR 模型会在首次运行时自动下载
```

### 4. 启动服务

**有 GPU (推荐):**
```bash
# 使用 docker compose
docker compose up --build

# 或后台运行
docker compose up -d --build
```

**仅 CPU (较慢):**
```bash
# 修改 docker-compose.yml，注释掉 GPU 配置
# 然后添加环境变量 USE_CPU=1

# 启动
docker compose up --build
```

### 5. 访问应用

- **前端**: http://localhost:5173
- **后端 WebSocket**: ws://localhost:8000/ws
- **健康检查**: http://localhost:8000/health

### 6. 查看日志

```bash
# 查看所有服务日志
docker compose logs -f

# 仅查看后端日志
docker compose logs -f backend

# 仅查看前端日志
docker compose logs -f frontend
```

### 7. 停止服务

```bash
# 停止服务
docker compose down

# 停止并删除数据卷
docker compose down -v
```

---

## 🐍 本地 Python 部署

### 1. 安装 Python 环境

```bash
# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
source venv/bin/activate  # macOS/Linux
# 或
venv\Scripts\activate  # Windows
```

### 2. 安装依赖

```bash
# 安装后端依赖
cd backend
pip install -r requirements.txt

# 安装 CosyVoice (手动)
git clone https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice
pip install -e .
cd ..
```

### 3. 下载模型

```bash
# 下载 CosyVoice 模型
mkdir -p pretrained_models
cd pretrained_models
git clone https://www.modelscope.cn/iic/CosyVoice-300M.git
cd ..

# FunASR 模型会自动下载
```

### 4. 配置环境变量

```bash
# 创建 .env
export OPENAI_API_KEY=sk-your-key
export LLM_API_KEY=sk-your-key
export LLM_MODEL=gpt-4o-mini
```

### 5. 启动后端服务

```bash
# 在 backend/ 目录
python server.py

# 服务会在 http://localhost:8000 启动
```

### 6. 启动前端服务

```bash
# 在项目根目录
npm install
npm run dev:all

# 前端: http://localhost:5173
# Token 服务: http://localhost:3000
```

---

## 📦 模型下载

### CosyVoice 模型

**模型选择:**

| 模型 | 大小 | 显存需求 | 质量 | 速度 |
|------|------|----------|------|------|
| CosyVoice-300M | ~600MB | 2GB | 中等 | 快 |
| CosyVoice-0.5B | ~1GB | 4GB | 好 | 中等 |
| CosyVoice-1B | ~2GB | 8GB | 最好 | 慢 |

**下载命令:**
```bash
cd backend/pretrained_models

# 300M (推荐开始使用)
git clone https://www.modelscope.cn/iic/CosyVoice-300M.git

# 0.5B (更高质量)
git clone https://www.modelscope.cn/iic/CosyVoice-0.5B.git

# 1B (最高质量)
git clone https://www.modelscope.cn/iic/CosyVoice-1B.git
```

### Fun-ASR 模型

FunASR 模型会在首次运行时自动下载到 `~/.cache/modelscope/`

**手动下载 (可选):**
```bash
from modelscope.hub.snapshot_download import snapshot_download
model_dir = snapshot_download('iic/SenseVoiceSmall')
```

---

## ⚙️ 配置说明

### Docker Image 选择

**1. NVIDIA GPU (推荐)**
```dockerfile
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04
```
- ✅ 支持 CUDA 加速
- ✅ TTS/ASR 实时推理
- ⚠️ 需要 NVIDIA Docker Runtime

**2. CPU Only**
```dockerfile
FROM python:3.10-slim
```
- ✅ 无需 GPU
- ⚠️ 推理速度慢 (实时率 ~0.3)
- ✅ 适合测试

**3. Apple Silicon (M1/M2/M3)**
- ⚠️ Docker 不支持 GPU 透传
- ✅ 建议直接本地 Python 运行
- ✅ 自动使用 MPS 加速

### 端口配置

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端 Vite | 5173 | React 开发服务器 |
| Token 服务 | 3000 | OpenAI/Grok token 生成 |
| 后端 WebSocket | 8000 | 本地语音服务 |
| 健康检查 | 8000 | /health 端点 |

### 性能优化

**GPU 内存优化:**
```python
# 使用小模型
TTS_MODEL=CosyVoice-300M

# 启用混合精度
# (在代码中配置)
model.half()  # FP16
```

**音频缓冲优化:**
```python
# 调整缓冲区大小 (ms)
buffer_duration_ms = 200  # ASR
chunk_size = 1024  # TTS
```

---

## 🔧 故障排除

### 问题 1: Docker 构建失败

**错误**: `Could not find a version that satisfies...`

**解决**:
```bash
# 清理 Docker 缓存
docker system prune -a

# 重新构建
docker compose build --no-cache
```

### 问题 2: GPU 不可用

**检查**:
```bash
# 检查 NVIDIA Driver
nvidia-smi

# 检查 Docker GPU 支持
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

**解决**:
- 安装 NVIDIA Docker Runtime
- 检查 docker-compose.yml 中的 GPU 配置

### 问题 3: 模型下载失败

**错误**: `Connection timeout`

**解决**:
```bash
# 使用国内镜像
pip install modelscope -i https://pypi.tuna.tsinghua.edu.cn/simple

# 手动下载模型
git clone https://www.modelscope.cn/iic/CosyVoice-300M.git
```

### 问题 4: WebSocket 连接失败

**错误**: `Failed to connect to ws://localhost:8000`

**检查**:
```bash
# 检查后端服务是否运行
docker compose ps
curl http://localhost:8000/health

# 检查日志
docker compose logs backend
```

### 问题 5: 音频播放没有声音

**检查**:
1. 浏览器音频权限
2. 麦克风权限
3. 检查浏览器控制台错误
4. 检查 WebSocket 消息流

### 问题 6: CPU 模式太慢

**优化**:
```bash
# 使用更小的模型
TTS_MODEL=CosyVoice-300M

# 减少音频质量
sample_rate = 16000  # 降低采样率

# 或考虑使用 GPU 云服务
```

---

## 📊 性能基准

### GPU (RTX 3060)
- ASR 延迟: ~100ms
- LLM 延迟: ~500ms (取决于远程 API)
- TTS 首包: ~150ms
- 端到端延迟: ~750ms

### CPU (Intel i7)
- ASR 延迟: ~500ms
- LLM 延迟: ~500ms
- TTS 首包: ~2000ms
- 端到端延迟: ~3000ms

---

## 🎯 下一步

1. ✅ 完成 Docker 部署
2. ✅ 测试语音对话流程
3. 🔄 调优延迟和音质
4. 📈 监控性能指标
5. 🚀 部署到生产环境 (EC2/云服务器)

---

## 📞 技术支持

遇到问题？
- 查看 [GitHub Issues](https://github.com/your-repo/issues)
- 查看服务日志: `docker compose logs -f`
- 检查健康状态: `curl http://localhost:8000/health`

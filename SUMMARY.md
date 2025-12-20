# 项目调整完成总结

## ✅ 已完成的调整

### 1. **模型配置更新**
- ✅ ASR: `iic/SenseVoiceSmall` → `iic/SenseVoiceNano` (更快)
- ✅ LLM: `deepseek-r1:1.5b` → `qwen3:0.6b` (EC2 已安装)
- ✅ TTS: 保持 `CosyVoice-300M` (本地运行)

### 2. **Ollama 配置调整**
- ✅ Docker URL: `host.docker.internal:11434` → `localhost:11434`
- ✅ 模型: 所有配置文件已更新为 `qwen3:0.6b`
- ✅ 适配本地运行模式（非 Docker 容器内）

### 3. **GPU 模式启用**
- ✅ 移除 `USE_CPU=1` 标志
- ✅ Docker Compose 设置 `USE_CPU=0`
- ✅ `.env` 默认使用 GPU (`USE_CPU=0`)

### 4. **启动脚本**
- ✅ 创建 `scripts/start-local.sh` - EC2 本地运行脚本
- ✅ 更新 `scripts/start.sh` - 默认模型改为 `qwen3:0.6b`
- ✅ 包含完整的依赖检查和错误处理

### 5. **文档更新**
- ✅ 创建 `EC2_SETUP.md` - 完整 EC2 GPU 部署指南
- ✅ 创建 `EC2_QUICKSTART.md` - 快速参考文档
- ✅ 更新 `README.md` - 添加 EC2 部署说明和架构图
- ✅ 保留原有 Docker 文档 (`DEPLOYMENT.md`)

### 6. **配置文件更新**
| 文件 | 更改 |
|------|------|
| `.env` | ✅ `qwen3:0.6b`, `localhost:11434`, `SenseVoiceNano`, `USE_CPU=0` |
| `.env.example` | ✅ 同上（模板） |
| `docker-compose.yml` | ✅ 同上（保留以防需要 Docker） |
| `backend/services/asr_service.py` | ✅ 默认 `SenseVoiceNano`, 添加 `trust_remote_code=True` |

---

## 📋 在 EC2 上的下一步操作

### 1. **确认环境**
```bash
# 检查 GPU
nvidia-smi

# 检查 Ollama 和模型
ollama list  # 应该看到 qwen3:0.6b

# 检查 Python 和 Node
python3 --version  # 3.10+
node --version     # 18+
```

### 2. **克隆或更新代码**
```bash
# 如果是新 EC2
git clone https://github.com/terryjiang2020/ai-voice-agent-tester.git
cd ai-voice-agent-tester

# 如果已有代码
cd ai-voice-agent-tester
git pull origin main
```

### 3. **配置 .env**
```bash
cp .env.example .env
nano .env
```

**重要**: 修改这一行：
```bash
VITE_BACKEND_WS=ws://<YOUR_EC2_PUBLIC_IP>:8000/ws
```

将 `<YOUR_EC2_PUBLIC_IP>` 替换为你的 EC2 公网 IP。

### 4. **安装依赖**

#### Python 后端
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### CosyVoice（如果未安装）
```bash
# 在 backend 目录下
git clone https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice && pip install -e . && cd ..

# 下载模型
git clone https://www.modelscope.cn/iic/CosyVoice-300M.git pretrained_models/CosyVoice-300M
```

#### 前端
```bash
cd ..  # 回到项目根目录
npm install
```

### 5. **启动服务**

#### 方式 A: 使用自动脚本（推荐）
```bash
chmod +x scripts/start-local.sh
./scripts/start-local.sh
```

#### 方式 B: 手动启动
```bash
# 终端 1: 启动 Ollama（如果未运行）
nohup ollama serve > ollama.log 2>&1 &

# 终端 2: 启动后端
cd backend
source venv/bin/activate
python server.py

# 终端 3: 启动前端
cd ..
npm run dev -- --host 0.0.0.0
```

### 6. **访问应用**
```
http://<YOUR_EC2_PUBLIC_IP>:5173
```

如果 EC2 安全组未开放 5173 端口，使用 SSH 隧道：
```bash
# 在本地机器执行
ssh -L 5173:localhost:5173 -L 8000:localhost:8000 ubuntu@<EC2_IP>
```

然后访问 `http://localhost:5173`

---

## 🎯 预期效果

### 模型加载顺序
1. **Fun-ASR Nano** - 首次运行时从 ModelScope 自动下载（约 50MB）
2. **Ollama qwen3:0.6b** - EC2 已安装，直接使用
3. **CosyVoice-300M** - 需要手动下载到 `backend/pretrained_models/`

### 运行时性能（g4dn.xlarge）
- **ASR 延迟**: ~100-200ms（GPU 加速）
- **LLM 响应**: ~500ms-1s（qwen3:0.6b 推理）
- **TTS 合成**: ~200-500ms（流式输出）
- **端到端延迟**: ~1-2s（实时对话体验）

### 显存使用（NVIDIA T4 16GB）
- Fun-ASR Nano: ~500MB
- Ollama qwen3:0.6b: ~1GB
- CosyVoice-300M: ~2GB
- **总计**: ~3.5GB（有充足余量）

---

## 🔍 验证检查清单

在 EC2 上运行后，依次检查：

```bash
# ✅ GPU 可用
nvidia-smi

# ✅ Ollama 运行
curl http://localhost:11434/v1/models
# 应该返回包含 qwen3:0.6b 的 JSON

# ✅ 后端健康
curl http://localhost:8000/health
# 应该返回 {"status": "ok"}

# ✅ PyTorch CUDA
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"
# 应该输出 CUDA: True

# ✅ Fun-ASR 模型
ls ~/.cache/modelscope/models/iic/SenseVoiceNano/
# 首次运行后应该有模型文件

# ✅ CosyVoice 模型
ls backend/pretrained_models/CosyVoice-300M/
# 应该有 cosyvoice.pt 等文件
```

---

## 📝 关键变更摘要

### 配置变更
```diff
# Ollama
- OLLAMA_BASE_URL=http://host.docker.internal:11434/v1
+ OLLAMA_BASE_URL=http://localhost:11434/v1

- OLLAMA_MODEL=deepseek-r1:1.5b
+ OLLAMA_MODEL=qwen3:0.6b

# ASR
- ASR_MODEL=iic/SenseVoiceSmall
+ ASR_MODEL=iic/SenseVoiceNano

# GPU
- USE_CPU=1
+ USE_CPU=0
```

### 新增文件
```
scripts/start-local.sh      # EC2 本地启动脚本
EC2_SETUP.md                # 完整部署指南
EC2_QUICKSTART.md           # 快速参考
SUMMARY.md                  # 本文档
```

### 修改文件
```
.env                        # 生产配置
.env.example                # 配置模板
docker-compose.yml          # Docker 配置（保留）
README.md                   # 主文档
backend/services/asr_service.py  # ASR 服务
scripts/start.sh            # 通用启动脚本
```

---

## 🎉 完成状态

所有调整已完成，项目现在：
- ✅ 支持 EC2 GPU 本地运行（主要模式）
- ✅ 使用你在 EC2 上已安装的模型
- ✅ 保留 Docker 支持（可选）
- ✅ 提供完整文档和启动脚本
- ✅ GPU 加速全流程（ASR/LLM/TTS）

**下一步**: 在 EC2 上执行上述安装步骤，启动服务并测试。

如果遇到问题，参考：
- 完整指南: `EC2_SETUP.md`
- 快速参考: `EC2_QUICKSTART.md`
- 故障排除: `README.md` 的 Troubleshooting 部分

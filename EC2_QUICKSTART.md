# EC2 快速启动指南

## 🚀 快速开始（已配置好 EC2）

如果你的 EC2 已经安装好所有依赖，快速启动：

```bash
# 1. 启动 Ollama（后台）
nohup ollama serve > ollama.log 2>&1 &

# 2. 确认模型已下载
ollama list  # 应该看到 qwen3:0.6b

# 3. 启动应用
cd ~/ai-voice-agent-tester
./scripts/start-local.sh
```

访问: `http://<EC2_IP>:5173`

---

## 📋 EC2 上需要的文件和模型

### 必需模型位置
```
~/ai-voice-agent-tester/
├── backend/
│   ├── pretrained_models/
│   │   └── CosyVoice-300M/          # TTS 模型（约 1GB）
│   ├── CosyVoice/                    # CosyVoice 代码库
│   └── venv/                         # Python 虚拟环境
└── .env                              # 配置文件
```

### Ollama 模型
```bash
ollama pull qwen3:0.6b  # LLM 模型（约 400MB）
```

### Fun-ASR 模型
会在首次运行时自动从 ModelScope 下载到：
```
~/.cache/modelscope/models/iic/SenseVoiceNano/
```

---

## 🔧 环境变量配置（.env）

```bash
# Ollama（本地）
USE_LOCAL_LLM=1
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen3:0.6b

# 模型
ASR_MODEL=iic/SenseVoiceNano
TTS_MODEL=CosyVoice-300M

# GPU
USE_CPU=0

# 网络（重要：填写 EC2 公网 IP）
VITE_BACKEND_WS=ws://YOUR_EC2_PUBLIC_IP:8000/ws
```

---

## 🎯 手动启动（分步）

### 1. 启动 Ollama
```bash
# 检查是否已运行
ps aux | grep ollama

# 如果没运行，启动
nohup ollama serve > ollama.log 2>&1 &
```

### 2. 启动后端
```bash
cd ~/ai-voice-agent-tester/backend
source venv/bin/activate
python server.py
```

### 3. 启动前端（新终端）
```bash
cd ~/ai-voice-agent-tester
npm run dev -- --host 0.0.0.0
```

---

## ✅ 验证检查

### GPU 检查
```bash
nvidia-smi
# 应该看到 GPU 信息和使用率
```

### Ollama 检查
```bash
curl http://localhost:11434/v1/models
# 应该返回 qwen3:0.6b
```

### 后端健康检查
```bash
curl http://localhost:8000/health
# 应该返回 {"status": "ok"}
```

### 模型文件检查
```bash
# CosyVoice
ls backend/pretrained_models/CosyVoice-300M/

# Fun-ASR（首次运行后）
ls ~/.cache/modelscope/models/iic/SenseVoiceNano/
```

---

## 🐛 常见问题快速修复

### Ollama 连接失败
```bash
pkill ollama
nohup ollama serve > ollama.log 2>&1 &
```

### 端口被占用
```bash
# 查找并杀死进程
sudo lsof -i :8000  # 后端
sudo lsof -i :5173  # 前端
sudo kill -9 <PID>
```

### GPU 未使用
```bash
# 检查 .env
cat .env | grep USE_CPU  # 应该是 0

# 检查 CUDA
python -c "import torch; print(torch.cuda.is_available())"
```

### CosyVoice 模型未找到
```bash
cd ~/ai-voice-agent-tester/backend
git clone https://www.modelscope.cn/iic/CosyVoice-300M.git pretrained_models/CosyVoice-300M
```

---

## 📊 性能监控

### 实时 GPU 监控
```bash
watch -n 1 nvidia-smi
```

### 后端日志
```bash
tail -f ~/ai-voice-agent-tester/backend/logs/app.log
```

### Ollama 日志
```bash
tail -f ~/ollama.log
```

---

## 🔄 更新代码

```bash
cd ~/ai-voice-agent-tester
git pull origin main

# 重新安装依赖（如果有更新）
cd backend
source venv/bin/activate
pip install -r requirements.txt

cd ..
npm install

# 重启服务
./scripts/start-local.sh
```

---

## 🛑 停止服务

```bash
# 停止前端（Ctrl+C 在运行终端）

# 停止后端
pkill -f "python server.py"

# 停止 Ollama
pkill ollama
```

---

## 🎉 完整命令序列（全新安装）

```bash
# 1. 克隆项目
git clone https://github.com/terryjiang2020/ai-voice-agent-tester.git
cd ai-voice-agent-tester

# 2. 配置环境
cp .env.example .env
nano .env  # 修改 VITE_BACKEND_WS

# 3. 安装 Ollama 和模型
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen3:0.6b

# 4. 安装 Python 依赖
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 5. 安装 CosyVoice
git clone https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice && pip install -e . && cd ..
git clone https://www.modelscope.cn/iic/CosyVoice-300M.git pretrained_models/CosyVoice-300M

# 6. 安装前端依赖
cd ..
npm install

# 7. 启动
./scripts/start-local.sh
```

详细说明请参考 `EC2_SETUP.md`。

# EC2 GPU 部署指南（本地运行模式）

本指南说明如何在 AWS EC2 GPU 实例上直接运行语音对话系统（不使用 Docker）。

## 🖥 EC2 实例要求

### 推荐配置
- **实例类型**: `g4dn.xlarge` 或更高（NVIDIA T4 GPU）
- **AMI**: Deep Learning AMI GPU PyTorch 2.0+ (Ubuntu 22.04)
- **存储**: 至少 50GB SSD
- **安全组**: 开放端口 8000（后端）、5173（前端）

### 最低配置
- **CPU**: 4 核心
- **内存**: 16GB
- **GPU**: NVIDIA GPU with CUDA 11.8+
- **操作系统**: Ubuntu 22.04 LTS

---

## 📦 1. 系统依赖安装

### 1.1 更新系统
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 安装 Python 3.10+
```bash
sudo apt install -y python3.10 python3.10-venv python3-pip
python3 --version  # 确认版本
```

### 1.3 安装 NVIDIA 驱动和 CUDA（如果未预装）
```bash
# 检查 CUDA
nvidia-smi

# 如果未安装，使用 Deep Learning AMI 或手动安装 CUDA 11.8
# https://developer.nvidia.com/cuda-downloads
```

### 1.4 安装 FFmpeg 和音频库
```bash
sudo apt install -y ffmpeg libsndfile1 git
```

### 1.5 安装 Node.js 18+
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # 确认版本
```

---

## 🦙 2. 安装 Ollama

```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 启动 Ollama 服务（后台运行）
nohup ollama serve > ollama.log 2>&1 &

# 拉取模型
ollama pull qwen3:0.6b

# 验证
ollama list
```

---

## 🎯 3. 克隆和配置项目

### 3.1 克隆仓库
```bash
cd ~
git clone https://github.com/terryjiang2020/ai-voice-agent-tester.git
cd ai-voice-agent-tester
```

### 3.2 配置环境变量
```bash
cp .env.example .env
nano .env
```

确保以下配置正确：
```bash
# 本地 Ollama
USE_LOCAL_LLM=1
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen3:0.6b

# 模型配置
ASR_MODEL=iic/SenseVoiceNano
TTS_MODEL=CosyVoice-300M

# GPU 模式
USE_CPU=0

# 前端 WebSocket
VITE_BACKEND_WS=ws://<YOUR_EC2_PUBLIC_IP>:8000/ws
```

**重要**: 将 `<YOUR_EC2_PUBLIC_IP>` 替换为你的 EC2 公网 IP。

---

## 🐍 4. 安装 Python 后端

### 4.1 创建虚拟环境
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

### 4.2 安装依赖
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4.3 安装 CosyVoice（本地模型）
```bash
# 方式 1：从 ModelScope 克隆
git clone https://www.modelscope.cn/iic/CosyVoice-300M.git pretrained_models/CosyVoice-300M

# 方式 2：从 Hugging Face 克隆（国际网络更快）
git lfs install
git clone https://huggingface.co/FunAudioLLM/CosyVoice-300M pretrained_models/CosyVoice-300M
```

### 4.4 安装 CosyVoice 代码库
```bash
# 克隆 CosyVoice 仓库
git clone https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice
pip install -e .
cd ..
```

---

## ⚡ 5. 启动服务

### 5.1 使用自动启动脚本（推荐）
```bash
cd ~/ai-voice-agent-tester
chmod +x scripts/start-local.sh
./scripts/start-local.sh
```

### 5.2 手动启动

#### 启动后端
```bash
cd ~/ai-voice-agent-tester/backend
source venv/bin/activate
python server.py
```

后端将在 `http://0.0.0.0:8000` 启动。

#### 启动前端（新终端）
```bash
cd ~/ai-voice-agent-tester
npm install
npm run dev
```

前端将在 `http://0.0.0.0:5173` 启动。

---

## 🌐 6. 访问应用

### 从本地浏览器访问
```
http://<YOUR_EC2_PUBLIC_IP>:5173
```

### SSH 端口转发（如果端口未开放）
```bash
# 在本地机器执行
ssh -L 5173:localhost:5173 -L 8000:localhost:8000 ubuntu@<EC2_IP>
```

然后访问 `http://localhost:5173`

---

## 🔧 7. 验证安装

### 7.1 检查 GPU
```bash
nvidia-smi
```

应该看到 GPU 使用率上升（当模型加载时）。

### 7.2 检查后端健康
```bash
curl http://localhost:8000/health
```

应该返回 `{"status": "ok"}`。

### 7.3 检查 Ollama
```bash
curl http://localhost:11434/v1/models
```

应该看到 `qwen3:0.6b` 在模型列表中。

### 7.4 测试 ASR 模型加载
```python
from funasr import AutoModel

model = AutoModel(
    model="iic/SenseVoiceNano",
    trust_remote_code=True,
    device="cuda"
)
print("✅ ASR model loaded successfully")
```

---

## 🚀 8. 生产环境配置

### 8.1 使用 systemd 自动启动

#### 后端服务
```bash
sudo nano /etc/systemd/system/voice-backend.service
```

内容：
```ini
[Unit]
Description=Voice Agent Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/ai-voice-agent-tester/backend
Environment="PATH=/home/ubuntu/ai-voice-agent-tester/backend/venv/bin"
ExecStart=/home/ubuntu/ai-voice-agent-tester/backend/venv/bin/python server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

启动：
```bash
sudo systemctl daemon-reload
sudo systemctl enable voice-backend
sudo systemctl start voice-backend
sudo systemctl status voice-backend
```

#### 前端服务
```bash
sudo nano /etc/systemd/system/voice-frontend.service
```

内容：
```ini
[Unit]
Description=Voice Agent Frontend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/ai-voice-agent-tester
ExecStart=/usr/bin/npm run dev
Restart=always

[Install]
WantedBy=multi-user.target
```

### 8.2 使用 Nginx 反向代理
```bash
sudo apt install -y nginx

sudo nano /etc/nginx/sites-available/voice-agent
```

内容：
```nginx
server {
    listen 80;
    server_name <YOUR_DOMAIN>;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:8000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

启用：
```bash
sudo ln -s /etc/nginx/sites-available/voice-agent /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 📊 9. 性能优化

### 9.1 GPU 显存优化
```bash
# 设置 PyTorch 显存分配策略
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128
```

### 9.2 模型量化（可选）
如果显存不足，可以使用量化版本：
```bash
# ASR 使用 INT8 量化
ASR_MODEL=iic/SenseVoiceNano-int8

# Ollama 使用量化模型
ollama pull qwen3:0.6b-q4_0
```

### 9.3 并发优化
在 `.env` 中调整：
```bash
WORKERS=2  # 根据 GPU 数量调整
BATCH_SIZE=4  # 根据显存大小调整
```

---

## 🐛 10. 常见问题

### CUDA Out of Memory
```bash
# 减少批处理大小
export BATCH_SIZE=1

# 或使用 CPU 模式（备用）
export USE_CPU=1
```

### Ollama 连接失败
```bash
# 检查服务状态
ps aux | grep ollama

# 重启服务
pkill ollama
nohup ollama serve > ollama.log 2>&1 &
```

### CosyVoice 模型未找到
```bash
ls -la backend/pretrained_models/CosyVoice-300M
# 如果为空，重新下载模型
```

### 端口被占用
```bash
# 查找占用端口的进程
sudo lsof -i :8000
sudo lsof -i :5173

# 杀死进程
sudo kill -9 <PID>
```

---

## 📝 11. 监控和日志

### 查看后端日志
```bash
tail -f ~/ai-voice-agent-tester/backend/logs/app.log
```

### 查看 Ollama 日志
```bash
tail -f ~/ollama.log
```

### GPU 监控
```bash
watch -n 1 nvidia-smi
```

---

## 🔐 12. 安全建议

1. **防火墙配置**: 仅开放必要端口（80/443/22）
2. **HTTPS**: 使用 Let's Encrypt 配置 SSL
3. **API 密钥**: 不要将敏感密钥提交到 Git
4. **SSH 密钥**: 禁用密码登录，仅使用 SSH 密钥

---

## 📚 13. 相关资源

- [Fun-ASR 文档](https://github.com/alibaba-damo-academy/FunASR)
- [CosyVoice 文档](https://github.com/FunAudioLLM/CosyVoice)
- [Ollama 文档](https://ollama.com/docs)
- [AWS EC2 GPU 实例](https://aws.amazon.com/ec2/instance-types/g4/)

---

## 🎉 完成！

现在你的 EC2 GPU 实例已经配置好本地运行模式，可以：
- ✅ 使用本地 GPU 加速 ASR/TTS
- ✅ 使用本地 Ollama (qwen3:0.6b) 进行对话
- ✅ 无需 Docker 开销，性能更优
- ✅ 完全本地推理，数据隐私有保障

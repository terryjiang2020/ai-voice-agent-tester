# 📂 项目文件结构

```
ai-voice-agent-tester/
├── 📄 docker-compose.yml          # Docker Compose 配置
├── 📄 .env.example                # 环境变量模板
├── 📄 DEPLOYMENT.md               # 完整部署指南
├── 📄 QUICKSTART.md              # 5分钟快速开始
├── 📄 README.md                   # 项目主文档
│
├── 🐳 backend/                    # Python 后端服务
│   ├── 📄 Dockerfile             # 后端 Docker 镜像
│   ├── 📄 requirements.txt       # Python 依赖
│   ├── 📄 server.py              # 主服务入口 (FastAPI + WebSocket)
│   │
│   ├── 📁 services/              # 核心服务模块
│   │   ├── asr_service.py       # Fun-ASR 语音识别
│   │   ├── tts_service.py       # CosyVoice 语音合成
│   │   └── llm_service.py       # LLM 对话引擎
│   │
│   ├── 📁 utils/                 # 工具函数
│   │   └── audio_utils.py       # 音频处理
│   │
│   └── 📁 pretrained_models/     # 模型文件 (需下载)
│       └── CosyVoice-300M/       # TTS 模型
│
├── 🎨 src/                        # React 前端
│   ├── App.jsx                   # 主应用组件 (已添加本地模型支持)
│   ├── App.css                   # 样式
│   ├── main.jsx                  # 入口文件
│   │
│   └── 📁 services/              # 前端服务
│       └── localVoiceService.js # 本地 WebSocket 客户端
│
├── 🔧 scripts/                    # 部署脚本
│   ├── download_models.sh        # 模型下载
│   └── start.sh                  # 快速启动
│
├── 📄 server.js                   # Express token 服务 (OpenAI/Grok)
├── 📄 constants.js                # 配置常量
├── 📄 package.json                # Node.js 依赖
├── 📄 vite.config.js              # Vite 配置
│
└── 🗂️ .temp/                      # 临时文件
    └── plan.md                    # 实施计划追踪
```

---

## 🔑 关键文件说明

### Docker 相关
- **`docker-compose.yml`**: 定义两个服务 (backend + frontend)
- **`backend/Dockerfile`**: Python 后端镜像 (GPU/CPU 支持)
- **`.env.example`**: 环境变量模板 (API Keys, 模型配置)

### 后端服务 (Python)
- **`backend/server.py`**: FastAPI WebSocket 服务，处理音频流
- **`backend/services/asr_service.py`**: Fun-ASR 实时语音识别
- **`backend/services/tts_service.py`**: CosyVoice 流式语音合成
- **`backend/services/llm_service.py`**: OpenAI LLM 对话接口
- **`backend/utils/audio_utils.py`**: 音频格式转换、重采样

### 前端 (React)
- **`src/App.jsx`**: 主界面，支持 OpenAI / Grok / 本地模型切换
- **`src/services/localVoiceService.js`**: 本地 WebSocket 客户端封装

### 部署脚本
- **`scripts/download_models.sh`**: 自动下载 CosyVoice 模型
- **`scripts/start.sh`**: 一键启动 Docker 服务

### 文档
- **`QUICKSTART.md`**: 5 分钟快速部署指南
- **`DEPLOYMENT.md`**: 详细部署文档 (包含故障排除)

---

## 📦 创建的新文件 (本次实施)

✅ **Docker 配置**
- `docker-compose.yml`
- `backend/Dockerfile`
- `.env.example`

✅ **后端服务**
- `backend/server.py`
- `backend/services/asr_service.py`
- `backend/services/tts_service.py`
- `backend/services/llm_service.py`
- `backend/utils/audio_utils.py`
- `backend/requirements.txt`

✅ **前端适配**
- `src/services/localVoiceService.js`
- `src/App.jsx` (已修改，添加本地模型选项)

✅ **部署工具**
- `scripts/download_models.sh`
- `scripts/start.sh`
- `DEPLOYMENT.md`
- `QUICKSTART.md`

---

## 🚀 下一步操作

1. **配置环境**
   ```bash
   cp .env.example .env
   # 编辑 .env，添加 OpenAI API Key
   ```

2. **下载模型**
   ```bash
   ./scripts/download_models.sh
   ```

3. **启动服务**
   ```bash
   ./scripts/start.sh
   # 或
   docker compose up --build
   ```

4. **访问应用**
   - 前端: http://localhost:5173
   - 选择 "🏠 Local Model"
   - 点击 "Connect"

---

## 📚 相关文档

- [QUICKSTART.md](QUICKSTART.md) - 快速开始
- [DEPLOYMENT.md](DEPLOYMENT.md) - 详细部署
- [.temp/plan.md](.temp/plan.md) - 实施计划

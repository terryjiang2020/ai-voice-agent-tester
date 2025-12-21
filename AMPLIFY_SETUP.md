# AWS Amplify 部署方案

## 🏗️ 架构说明

AWS Amplify **仅支持静态前端托管**，不能运行 Python 后端或 AI 模型。因此需要采用**混合架构**：

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  AWS Amplify (前端托管)                          │
│  - React 应用                                    │
│  - 静态资源 (HTML/JS/CSS)                        │
│  - 全球 CDN 加速                                 │
│                                                 │
└────────────────┬────────────────────────────────┘
                 │ WebSocket
                 ↓
┌─────────────────────────────────────────────────┐
│                                                 │
│  EC2 / ECS / Lambda (后端)                      │
│  - Python FastAPI                               │
│  - Fun-ASR (语音识别)                            │
│  - Ollama (LLM 对话)                             │
│  - CosyVoice (语音合成)                          │
│  - GPU 加速 (可选)                               │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 🎯 推荐方案

### **方案 A: Amplify + EC2 GPU（推荐）**

✅ **优点**:
- 前端全球 CDN 加速
- 后端 GPU 加速（最佳性能）
- 适合生产环境

❌ **缺点**:
- 需要管理 EC2 实例
- 成本较高（~$0.526/小时 for g4dn.xlarge）

**适用场景**: 高性能实时语音对话，用户量大

---

### **方案 B: Amplify + ECS Fargate（平衡）**

✅ **优点**:
- 无需管理服务器
- 自动扩展
- 按需付费

❌ **缺点**:
- 仅 CPU 推理（无 GPU）
- 响应稍慢

**适用场景**: 中等用户量，可接受 2-3 秒延迟

---

### **方案 C: 仅 Amplify + Remote API（最简单）**

✅ **优点**:
- 完全无服务器
- 零运维
- 成本最低

❌ **缺点**:
- 需要 OpenAI/Grok API（按 token 计费）
- 无本地模型支持

**适用场景**: 快速原型、演示、个人项目

---

## 📋 方案 A: Amplify + EC2 GPU

### 第一步: 部署后端到 EC2

按照 **[EC2_SETUP.md](./EC2_SETUP.md)** 完整配置 EC2 GPU 实例。

关键配置：
```bash
# 在 EC2 上配置安全组
允许入站规则:
- 端口 8000 (WebSocket) - 来源: 0.0.0.0/0 或 Amplify IP 范围
- 端口 22 (SSH) - 来源: 你的 IP
```

启动后端：
```bash
# EC2 上执行
cd ~/ai-voice-agent-tester/backend
source venv/bin/activate
python server.py --host 0.0.0.0 --port 8000
```

获取 EC2 公网 IP：
```bash
curl http://checkip.amazonaws.com
```

### 第二步: 配置前端环境变量

在项目根目录创建 `.env.production`:

```bash
# Amplify 生产环境配置
VITE_BACKEND_WS=wss://<EC2_PUBLIC_IP>:8000/ws

# 如果使用 Remote API（备用）
VITE_OPENAI_API_KEY=sk-xxx
VITE_XAI_API_KEY=xai-xxx
```

**重要**: 
- 将 `<EC2_PUBLIC_IP>` 替换为你的 EC2 公网 IP
- 使用 `wss://`（SSL）需要配置 SSL 证书（见下文）

### 第三步: 部署前端到 Amplify

#### 3.1 准备构建配置

创建 `amplify.yml`:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

#### 3.2 在 Amplify Console 部署

1. 登录 [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. 点击 **"New app" → "Host web app"**
3. 选择 GitHub 并授权
4. 选择仓库: `terryjiang2020/ai-voice-agent-tester`
5. 选择分支: `main`
6. 配置构建设置（使用上面的 `amplify.yml`）
7. 添加环境变量:
   ```
   VITE_BACKEND_WS=wss://<EC2_IP>:8000/ws
   ```
8. 点击 **"Save and deploy"**

部署完成后，你会得到一个 Amplify URL：
```
https://main.d1234567890abc.amplifyapp.com
```

### 第四步: 配置 SSL/HTTPS（推荐）

为了使用 `wss://`（安全 WebSocket），需要为 EC2 配置 SSL 证书。

#### 4.1 使用 Let's Encrypt（免费）

```bash
# 在 EC2 上安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 安装 Nginx
sudo apt install -y nginx

# 配置 Nginx 反向代理
sudo nano /etc/nginx/sites-available/voice-backend
```

Nginx 配置内容：
```nginx
server {
    listen 80;
    server_name <YOUR_DOMAIN>;  # 需要域名，如 api.yourdomain.com

    location /ws {
        proxy_pass http://localhost:8000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /health {
        proxy_pass http://localhost:8000/health;
    }
}
```

启用配置并获取证书：
```bash
sudo ln -s /etc/nginx/sites-available/voice-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 获取 SSL 证书
sudo certbot --nginx -d api.yourdomain.com
```

#### 4.2 更新前端配置

```bash
# .env.production
VITE_BACKEND_WS=wss://api.yourdomain.com/ws
```

在 Amplify Console 更新环境变量并重新部署。

---

## 📋 方案 B: Amplify + ECS Fargate

### 第一步: 创建 Docker 镜像（CPU 版本）

使用现有的 `docker-compose.yml`，但只需要 backend 部分。

确保 Dockerfile 使用 CPU 模式：
```dockerfile
# backend/Dockerfile
FROM python:3.10-slim
# ... (现有内容)
ENV USE_CPU=1
```

### 第二步: 推送到 ECR

```bash
# 登录 ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# 创建仓库
aws ecr create-repository --repository-name voice-agent-backend

# 构建并推送
cd backend
docker build -t voice-agent-backend .
docker tag voice-agent-backend:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/voice-agent-backend:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/voice-agent-backend:latest
```

### 第三步: 创建 ECS 任务定义

在 AWS ECS Console:

1. 创建新任务定义（Fargate）
2. 配置：
   - CPU: 2 vCPU
   - Memory: 4 GB
   - 容器镜像: ECR 镜像 URL
   - 端口映射: 8000
   - 环境变量:
     ```
     USE_LOCAL_LLM=1
     OLLAMA_BASE_URL=http://<OLLAMA_HOST>:11434/v1
     OLLAMA_MODEL=qwen3:0.6b
     USE_CPU=1
     ```

**注意**: Fargate 不支持 GPU，Ollama 需要单独部署在 EC2 上。

### 第四步: 创建 ECS 服务

1. 创建 Application Load Balancer (ALB)
2. 配置目标组（WebSocket 支持）
3. 创建 ECS 服务并关联 ALB
4. 获取 ALB DNS 名称

### 第五步: 配置 Amplify

```bash
# .env.production
VITE_BACKEND_WS=wss://<ALB_DNS_NAME>/ws
```

---

## 📋 方案 C: 仅 Amplify + Remote API

这是最简单的方案，无需后端部署。

### 调整前端代码

项目已经支持 Remote API（OpenAI/Grok），无需修改代码。

### 配置 Amplify

在 Amplify Console 设置环境变量：

```bash
VITE_OPENAI_API_KEY=sk-your-openai-key
VITE_XAI_API_KEY=xai-your-grok-key
```

### 部署

1. 删除 `amplify.yml` 中的后端配置
2. 确保 `.env.production` 不包含 `VITE_BACKEND_WS`
3. 部署到 Amplify

用户将使用 OpenAI/Grok Realtime API，完全无服务器。

---

## 🔧 Amplify 构建配置优化

### amplify.yml（完整版）

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        # 使用 npm ci 加速安装
        - npm ci
        # 打印环境变量（调试用）
        - echo "Backend WS:" $VITE_BACKEND_WS
    build:
      commands:
        # 生产构建
        - npm run build
        # 验证构建输出
        - ls -la dist/
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
  customHeaders:
    - pattern: '**/*'
      headers:
        - key: 'Strict-Transport-Security'
          value: 'max-age=31536000; includeSubDomains'
        - key: 'X-Content-Type-Options'
          value: 'nosniff'
        - key: 'X-Frame-Options'
          value: 'DENY'
```

### 环境变量管理

在 Amplify Console → App settings → Environment variables:

```bash
# 方案 A (Amplify + EC2)
VITE_BACKEND_WS=wss://api.yourdomain.com/ws

# 方案 C (仅 Remote API)
VITE_OPENAI_API_KEY=sk-xxx
VITE_XAI_API_KEY=xai-xxx
```

---

## 🌐 自定义域名配置

### 在 Amplify 中添加自定义域名

1. 在 Amplify Console → Domain management
2. 添加域名: `voice.yourdomain.com`
3. Amplify 会自动配置 SSL 证书
4. 更新 DNS 记录（CNAME 或 A 记录）

### 后端域名（如果使用 EC2）

1. 在 Route 53 创建 A 记录:
   - `api.yourdomain.com` → EC2 Elastic IP
2. 使用 Let's Encrypt 配置 SSL（见上文）
3. 更新 Amplify 环境变量:
   ```
   VITE_BACKEND_WS=wss://api.yourdomain.com/ws
   ```

---

## 💰 成本估算（每月）

### 方案 A: Amplify + EC2 GPU
- **Amplify**: $0.01/GB（构建） + $0.15/GB（流量） ≈ $5-10
- **EC2 g4dn.xlarge**: $0.526/小时 × 730 小时 ≈ $384
- **EBS**: 50GB × $0.10/GB ≈ $5
- **总计**: ~$394/月

### 方案 B: Amplify + ECS Fargate
- **Amplify**: ~$5-10
- **Fargate**: 2 vCPU × $0.04048/小时 × 730 ≈ $59
- **Fargate Memory**: 4GB × $0.004445/GB/小时 × 730 ≈ $13
- **ALB**: $0.0225/小时 × 730 ≈ $16
- **总计**: ~$93/月

### 方案 C: 仅 Amplify + Remote API
- **Amplify**: ~$5-10
- **OpenAI API**: 按使用量（约 $0.002-0.006/分钟对话）
- **总计**: ~$15-50/月（低流量）

---

## 🐛 常见问题

### WebSocket 连接失败

**症状**: 前端无法连接到后端 WebSocket

**解决方案**:
1. 检查 EC2 安全组是否开放端口 8000
2. 确认后端 URL 正确（`ws://` 或 `wss://`）
3. 检查 CORS 配置：

```python
# backend/server.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://*.amplifyapp.com"],  # 添加 Amplify 域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Mixed Content 错误

**症状**: HTTPS 前端无法连接到 HTTP 后端

**解决方案**: 必须使用 `wss://`（配置 SSL 证书）

### Amplify 构建失败

**症状**: `npm run build` 失败

**解决方案**:
1. 检查 `package.json` 中的构建脚本
2. 确认环境变量正确设置
3. 查看 Amplify 构建日志

### 模型加载慢

**症状**: 首次请求需要 30+ 秒

**解决方案**:
1. 预加载模型（在 `startup_event` 中）
2. 使用更小的模型（Nano 版本）
3. 增加 EC2 实例类型

---

## 📚 相关文档

- [AWS Amplify 文档](https://docs.amplify.aws/)
- [EC2 部署指南](./EC2_SETUP.md)
- [ECS Fargate 文档](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)

---

## ✅ 推荐决策树

```
需要本地模型（隐私/成本）？
├─ 是 → 需要高性能（实时对话）？
│  ├─ 是 → 方案 A: Amplify + EC2 GPU ($394/月)
│  └─ 否 → 方案 B: Amplify + ECS Fargate CPU ($93/月)
└─ 否 → 方案 C: Amplify + Remote API ($15-50/月)
```

**生产环境推荐**: 方案 A（最佳性能）或方案 B（平衡）
**快速原型推荐**: 方案 C（最简单）

---

## 🎉 总结

Amplify 适合托管前端，但后端 AI 模型需要：
1. **EC2 GPU** - 最佳性能，推荐生产环境
2. **ECS Fargate** - 无服务器管理，适合中等负载
3. **Remote API** - 最简单，适合原型和演示

选择方案后，参考对应部分的详细步骤进行部署。

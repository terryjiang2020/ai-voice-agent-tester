# 部署方案对比

## 🎯 快速选择

| 场景 | 推荐方案 | 月成本 | 性能 | 复杂度 |
|-----|---------|-------|------|--------|
| **生产环境（高性能）** | Amplify + EC2 GPU | $400 | ⚡⚡⚡⚡⚡ | ⭐⭐⭐ |
| **生产环境（中等负载）** | Amplify + ECS Fargate | $100 | ⚡⚡⚡ | ⭐⭐⭐⭐ |
| **快速原型/演示** | Amplify + Remote API | $20 | ⚡⚡⚡⚡ | ⭐ |
| **本地开发** | 本地运行 | $0 | ⚡⚡⚡⚡ | ⭐⭐ |

---

## 📊 详细对比

### 1. Amplify + EC2 GPU

**架构**:
```
Amplify (前端) → EC2 GPU (后端)
                 ├─ Fun-ASR (GPU)
                 ├─ Ollama (GPU)
                 └─ CosyVoice (GPU)
```

✅ **优点**:
- 最佳性能（GPU 加速）
- 完全本地模型（数据隐私）
- 前端全球 CDN 加速
- 自定义模型支持

❌ **缺点**:
- 成本最高（$394/月）
- 需要管理 EC2
- 需要配置 SSL

💰 **成本明细**:
- Amplify: $5-10/月
- EC2 g4dn.xlarge: $384/月
- EBS 50GB: $5/月
- 流量: 包含在 Amplify

📖 **部署指南**: [AMPLIFY_SETUP.md](./AMPLIFY_SETUP.md) 方案 A

---

### 2. Amplify + ECS Fargate

**架构**:
```
Amplify (前端) → ALB → ECS Fargate (后端, CPU)
                       ├─ Fun-ASR (CPU)
                       ├─ Ollama (单独 EC2)
                       └─ CosyVoice (CPU)
```

✅ **优点**:
- 无需管理服务器
- 自动扩展
- 前端 CDN 加速
- 中等成本

❌ **缺点**:
- CPU 推理较慢
- Ollama 需要单独部署
- 配置复杂

💰 **成本明细**:
- Amplify: $5-10/月
- Fargate 2 vCPU: $59/月
- Fargate 4GB RAM: $13/月
- ALB: $16/月
- Ollama EC2: $30/月（t3.medium）

📖 **部署指南**: [AMPLIFY_SETUP.md](./AMPLIFY_SETUP.md) 方案 B

---

### 3. Amplify + Remote API

**架构**:
```
Amplify (前端) → OpenAI/Grok API
```

✅ **优点**:
- 最简单（零运维）
- 快速部署（5 分钟）
- 自动扩展
- 成本最低（低流量）

❌ **缺点**:
- 需要 API 密钥
- 按 token 计费
- 无本地模型
- 数据发送到第三方

💰 **成本明细**:
- Amplify: $5-10/月
- OpenAI API: $0.002-0.006/分钟
- 100 小时/月对话: ~$24

📖 **部署指南**: [AMPLIFY_SETUP.md](./AMPLIFY_SETUP.md) 方案 C

---

### 4. 本地开发

**架构**:
```
localhost:5173 (前端) → localhost:8000 (后端)
```

✅ **优点**:
- 完全免费
- 快速迭代
- 本地模型
- 无需云服务

❌ **缺点**:
- 仅本地访问
- 需要本地 GPU（可选）
- 不适合生产

💰 **成本**: $0

📖 **部署指南**: [README.md](./README.md#local-development)

---

## 🔄 迁移路径

### 从本地开发到生产

```
1. 本地开发
   ↓ 验证功能
2. Amplify + Remote API（快速上线）
   ↓ 获取用户反馈
3. Amplify + ECS Fargate（降低 API 成本）
   ↓ 用户增长
4. Amplify + EC2 GPU（最佳性能）
```

---

## 💡 决策树

```
┌─ 需要生产环境？
│  ├─ 否 → 本地开发
│  └─ 是 ┬─ 需要本地模型（隐私/成本）？
│         ├─ 否 → Amplify + Remote API
│         └─ 是 ┬─ 需要高性能（< 1秒响应）？
│                ├─ 是 → Amplify + EC2 GPU
│                └─ 否 → Amplify + ECS Fargate
```

---

## 🎯 推荐配置

### 个人项目/演示
```bash
方案: Amplify + Remote API
成本: $20/月
时间: 30 分钟部署
```

### 创业公司（初期）
```bash
方案: Amplify + ECS Fargate
成本: $100/月
时间: 2 小时部署
特点: 自动扩展，无需运维
```

### 企业级应用
```bash
方案: Amplify + EC2 GPU
成本: $400/月
时间: 4 小时部署
特点: 最佳性能，数据隐私
```

---

## 📈 性能对比

| 指标 | EC2 GPU | ECS Fargate | Remote API | 本地开发 |
|-----|---------|-------------|-----------|---------|
| ASR 延迟 | 100ms | 500ms | 300ms | 150ms |
| LLM 响应 | 500ms | 2s | 800ms | 600ms |
| TTS 合成 | 200ms | 800ms | 400ms | 300ms |
| **端到端** | **1s** | **3s** | **1.5s** | **1.2s** |
| 并发用户 | 50+ | 20+ | 100+ | 1 |

---

## 🔒 数据隐私对比

| 方案 | 语音数据 | 对话内容 | 模型权重 | 隐私等级 |
|-----|---------|---------|---------|---------|
| EC2 GPU | 私有 | 私有 | 私有 | ⭐⭐⭐⭐⭐ |
| ECS Fargate | 私有 | 私有 | 私有 | ⭐⭐⭐⭐⭐ |
| Remote API | 发送到 OpenAI | 发送到 OpenAI | 远程 | ⭐⭐ |
| 本地开发 | 私有 | 私有 | 私有 | ⭐⭐⭐⭐⭐ |

---

## 🛠️ 运维复杂度

| 任务 | EC2 GPU | ECS Fargate | Remote API | 本地开发 |
|-----|---------|-------------|-----------|---------|
| 初始配置 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ | ⭐⭐ |
| 日常运维 | ⭐⭐⭐ | ⭐ | ⭐ | ⭐ |
| 扩展难度 | ⭐⭐⭐ | ⭐ | ⭐ | N/A |
| 故障排查 | ⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐ |

---

## 📝 快速启动命令

### Amplify + EC2 GPU
```bash
# 1. 部署 EC2 后端
./scripts/start-local.sh

# 2. 配置 Amplify
# 在 Amplify Console 设置:
# VITE_BACKEND_WS=wss://api.yourdomain.com/ws

# 3. 推送代码触发部署
git push origin main
```

### Amplify + Remote API
```bash
# 1. 在 Amplify Console 设置:
# VITE_OPENAI_API_KEY=sk-xxx

# 2. 推送代码触发部署
git push origin main
```

---

## 🎉 总结

**最简单**: Amplify + Remote API（30 分钟上线）
**最经济**: Amplify + ECS Fargate（中等流量）
**最强大**: Amplify + EC2 GPU（生产级性能）

选择方案后，查看 [AMPLIFY_SETUP.md](./AMPLIFY_SETUP.md) 获取详细步骤。

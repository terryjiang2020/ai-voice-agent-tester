#!/usr/bin/env python3
"""
LLM 服务 - 对话引擎
支持远程 API (OpenAI/Anthropic) 和本地模型 (Ollama/Qwen)
"""

import os
from typing import AsyncGenerator, List, Dict
from loguru import logger

try:
    from openai import AsyncOpenAI
except ImportError:
    logger.warning("OpenAI SDK not installed")
    AsyncOpenAI = None


class LLMService:
    """LLM 对话服务"""
    
    def __init__(self):
        self.use_local = os.getenv("USE_LOCAL_LLM", "1") == "1"  # 默认使用本地
        self.api_key = os.getenv("LLM_API_KEY", "")
        
        # 本地 Ollama 配置
        self.ollama_base = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434/v1")
        self.ollama_model = os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b")
        
        # 远程 API 配置
        self.api_base = os.getenv("LLM_API_BASE", "https://api.openai.com/v1")
        self.model = os.getenv("LLM_MODEL", "gpt-4o-mini")
        
        # 系统提示词 (从现有配置复制)
        self.system_prompt = """
You are a voice order-taking AI agent for Chunky Chook (Chicken & Chips) in Auckland.
Your job is to take accurate pickup orders quickly, confirm details, and avoid mistakes.

## Restaurant Information
- Name: Chunky Chook (Chicken & Chips)
- Location: Auckland, New Zealand
- Specialty: Fried chicken and chips
- Operating Hours: 11:00 AM - 9:00 PM

## Your Responsibilities
1. Greet customers warmly
2. Take their order accurately
3. Confirm items, quantities, and special requests
4. Get customer name and phone number for pickup
5. Provide estimated pickup time (typically 15-20 minutes)
6. Thank them and confirm the order

## Guidelines
- Be friendly but efficient
- Clarify any unclear requests
- Suggest popular items if asked
- Always confirm the complete order before finishing
- Speak naturally and conversationally
""".strip()
        
        self.client = None
        
    async def initialize(self):
        """初始化 LLM 客户端"""
        if AsyncOpenAI is None:
            raise RuntimeError("OpenAI SDK not installed. Run: pip install openai")
        
        if self.use_local:
            # 使用 Ollama 本地模型
            logger.info(f"Initializing local LLM: {self.ollama_model}")
            logger.info(f"Ollama endpoint: {self.ollama_base}")
            
            self.client = AsyncOpenAI(
                api_key="ollama",  # Ollama 不需要真实 API key
                base_url=self.ollama_base
            )
            self.model = self.ollama_model
            
            # 测试连接
            try:
                # 简单测试请求
                logger.info("Testing Ollama connection...")
                await self._test_connection()
                logger.success(f"✅ Local LLM initialized: {self.ollama_model}")
            except Exception as e:
                logger.error(f"Failed to connect to Ollama: {e}")
                logger.warning("Ollama 可能未运行，请确保:")
                logger.warning("  1. Mac 本地: ollama serve")
                logger.warning("  2. Docker: 使用 host.docker.internal")
                raise
        else:
            # 使用远程 API
            self.client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.api_base
            )
            logger.success(f"✅ LLM service initialized (API: {self.api_base})")
    
    async def _test_connection(self):
        """测试 Ollama 连接"""
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5,
                stream=False
            )
            logger.info(f"Connection test successful: {response.choices[0].message.content[:20]}")
        except Exception as e:
            raise ConnectionError(f"Cannot connect to Ollama: {e}")
    
    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 500
    ) -> AsyncGenerator[str, None]:
        """
        流式对话
        
        Args:
            messages: 对话历史 [{"role": "user", "content": "..."}]
            temperature: 温度参数
            max_tokens: 最大生成长度
            
        Yields:
            文本增量
        """
        if self.client is None:
            await self.initialize()
        
        try:
            # 添加系统提示词
            full_messages = [
                {"role": "system", "content": self.system_prompt}
            ] + messages
            
            # 流式请求
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=full_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True
            )
            
            # 返回文本流
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
                    
        except Exception as e:
            logger.error(f"LLM chat error: {e}")
            yield f"[Error: {str(e)}]"
    
    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7
    ) -> str:
        """非流式对话"""
        if self.client is None:
            await self.initialize()
        
        try:
            full_messages = [
                {"role": "system", "content": self.system_prompt}
            ] + messages
            
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=full_messages,
                temperature=temperature
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"LLM chat error: {e}")
            return f"抱歉，出现错误: {str(e)}"


# ============================================
# 💬 使用示例
# ============================================
"""
# 初始化
llm = LLMService()

# 流式对话
messages = [
    {"role": "user", "content": "我想点一份炸鸡"}
]

async for token in llm.chat_stream(messages):
    print(token, end="", flush=True)

# 非流式
response = await llm.chat(messages)
print(response)
"""

#!/usr/bin/env python3
"""
TTS 服务 - 基于 CosyVoice (阿里开源)
支持流式语音合成与多语言
"""

import asyncio
import os
from typing import AsyncGenerator
import numpy as np
from loguru import logger

try:
    import torch
    import torchaudio
except ImportError:
    logger.warning("PyTorch not installed, TTS service will not work")
    torch = None


class TTSService:
    """TTS 语音合成服务"""
    
    def __init__(self):
        self.model = None
        self.model_name = os.getenv(
            "TTS_MODEL",
            "CosyVoice-300M"  # 轻量模型，适合实时推理
        )
        self.use_cpu = os.getenv("USE_CPU", "0") == "1"
        self.sample_rate = 24000  # CosyVoice 输出 24kHz
        
        # 流式生成配置
        self.chunk_size = 1024  # 每个音频块的样本数
        
    async def load_model(self):
        """加载 TTS 模型"""
        if torch is None:
            raise RuntimeError("PyTorch not installed. Run: pip install torch torchaudio")
        
        logger.info(f"Loading TTS model: {self.model_name}")
        
        try:
            # 检查 CosyVoice 是否已安装
            try:
                from cosyvoice.cli.cosyvoice import CosyVoice
            except ImportError:
                raise RuntimeError(
                    "CosyVoice not installed. Please install:\n"
                    "  cd backend\n"
                    "  git clone https://github.com/FunAudioLLM/CosyVoice.git\n"
                    "  cd CosyVoice && pip install -e ."
                )
            
            # 设置设备
            device = "cpu" if self.use_cpu else "cuda"
            if device == "cuda" and not torch.cuda.is_available():
                logger.warning("CUDA not available, falling back to CPU")
                device = "cpu"
            
            # 加载模型
            model_dir = f"pretrained_models/{self.model_name}"
            
            # 如果模型不存在，提供下载提示
            if not os.path.exists(model_dir):
                logger.warning(
                    f"Model not found at {model_dir}\n"
                    "Please download the model:\n"
                    "  cd backend\n"
                    "  git clone https://www.modelscope.cn/iic/CosyVoice-300M.git pretrained_models/CosyVoice-300M\n"
                )
                raise FileNotFoundError(f"Model directory not found: {model_dir}")
            
            self.model = CosyVoice(model_dir)
            self.device = device
            
            logger.success(f"✅ TTS model loaded on {device}")
            
        except Exception as e:
            logger.error(f"Failed to load TTS model: {e}")
            raise
    
    async def synthesize_stream(
        self, 
        text: str,
        voice: str = "中文女",
        speed: float = 1.0
    ) -> AsyncGenerator[bytes, None]:
        """
        流式语音合成
        
        Args:
            text: 要合成的文本
            voice: 音色 (预设音色或自定义)
            speed: 语速 (0.5-2.0)
            
        Yields:
            音频数据块 (PCM 24kHz mono)
        """
        if self.model is None:
            raise RuntimeError("TTS model not loaded")
        
        try:
            logger.info(f"Synthesizing: {text[:50]}...")
            
            # 文本分段 (按句子)
            sentences = self._split_text(text)
            
            for sentence in sentences:
                if not sentence.strip():
                    continue
                
                # 合成音频 (在线程池中运行)
                audio_chunks = await asyncio.to_thread(
                    self._synthesize_sentence,
                    sentence,
                    voice,
                    speed
                )
                
                # 流式返回音频块
                for chunk in audio_chunks:
                    yield chunk
                    
        except Exception as e:
            logger.error(f"TTS synthesis error: {e}")
            raise
    
    def _split_text(self, text: str) -> list:
        """文本分句"""
        # 简单分句策略
        separators = ["。", "！", "？", ".", "!", "?", "\n"]
        
        sentences = []
        current = ""
        
        for char in text:
            current += char
            if char in separators:
                sentences.append(current.strip())
                current = ""
        
        if current.strip():
            sentences.append(current.strip())
        
        return sentences
    
    def _synthesize_sentence(
        self,
        text: str,
        voice: str,
        speed: float
    ) -> list:
        """合成单个句子 (同步方法)"""
        try:
            # CosyVoice 推理
            # 注意: 实际 API 可能不同，需根据 CosyVoice 文档调整
            output = self.model.inference_sft(
                text=text,
                spk_id=voice,
                speed=speed,
            )
            
            # 提取音频数据
            if isinstance(output, dict) and "tts_speech" in output:
                audio_tensor = output["tts_speech"]
            else:
                audio_tensor = output
            
            # 转换为 numpy
            audio_np = audio_tensor.cpu().numpy()
            
            # 确保单声道
            if audio_np.ndim > 1:
                audio_np = audio_np.mean(axis=0)
            
            # 转换为 int16 PCM
            audio_int16 = (audio_np * 32767).astype(np.int16)
            
            # 分块
            chunks = []
            for i in range(0, len(audio_int16), self.chunk_size):
                chunk = audio_int16[i:i + self.chunk_size]
                chunks.append(chunk.tobytes())
            
            return chunks
            
        except Exception as e:
            logger.error(f"Sentence synthesis error: {e}")
            # 返回空音频块
            return [b'\x00' * self.chunk_size * 2]
    
    async def synthesize_to_file(
        self,
        text: str,
        output_file: str,
        voice: str = "中文女"
    ):
        """合成音频文件 (非流式)"""
        if self.model is None:
            raise RuntimeError("TTS model not loaded")
        
        try:
            # 收集所有音频块
            audio_chunks = []
            async for chunk in self.synthesize_stream(text, voice):
                audio_chunks.append(chunk)
            
            # 合并音频
            audio_bytes = b''.join(audio_chunks)
            audio_np = np.frombuffer(audio_bytes, dtype=np.int16)
            
            # 保存为 WAV
            audio_float = audio_np.astype(np.float32) / 32768.0
            audio_tensor = torch.from_numpy(audio_float).unsqueeze(0)
            
            torchaudio.save(
                output_file,
                audio_tensor,
                self.sample_rate
            )
            
            logger.success(f"Audio saved to {output_file}")
            
        except Exception as e:
            logger.error(f"File synthesis error: {e}")
            raise
    
    async def cleanup(self):
        """清理资源"""
        if self.model:
            del self.model
            self.model = None
        
        if torch and torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        logger.info("TTS service cleaned up")


# ============================================
# 🎙️ 使用示例
# ============================================
"""
# 初始化
tts = TTSService()
await tts.load_model()

# 流式合成
async for audio_chunk in tts.synthesize_stream("你好，世界！"):
    # 发送音频块给客户端
    await websocket.send_bytes(audio_chunk)

# 文件合成
await tts.synthesize_to_file("测试文本", "output.wav")
"""

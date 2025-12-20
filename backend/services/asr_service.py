#!/usr/bin/env python3
"""
ASR 服务 - 基于 FunASR (阿里开源)
支持实时流式语音识别
"""

import asyncio
import os
from typing import AsyncGenerator, Dict, Optional
import numpy as np
from loguru import logger

try:
    from funasr import AutoModel
    from modelscope.hub.snapshot_download import snapshot_download
    try:
        # 可选的 Hugging Face 兜底下载
        from huggingface_hub import snapshot_download as hf_snapshot_download
    except Exception:
        hf_snapshot_download = None
except ImportError:
    logger.warning("FunASR not installed, ASR service will not work")
    AutoModel = None


class ASRService:
    """ASR 语音识别服务"""
    
    def __init__(self):
        self.model = None
        self.model_name = os.getenv(
            "ASR_MODEL",
            "iic/SenseVoiceNano"  # Fun-ASR Nano 模型（更快）
        )
        self.use_cpu = os.getenv("USE_CPU", "0") == "1"
        self.sample_rate = 16000  # Fun-ASR 要求 16kHz
        
        # 流式处理缓冲区
        self.audio_buffer = []
        self.buffer_duration_ms = 200  # 每 200ms 处理一次
        
    async def load_model(self):
        """加载 ASR 模型"""
        if AutoModel is None:
            raise RuntimeError("FunASR not installed. Run: pip install funasr modelscope")
        
        logger.info(f"Loading ASR model: {self.model_name}")
        
        try:
            # 下载模型 (首次运行)
            model_dir = None
            try:
                model_dir = snapshot_download(self.model_name)
                logger.info(f"Model downloaded to (ModelScope): {model_dir}")
            except Exception as ms_err:
                logger.warning(f"ModelScope download failed for {self.model_name}: {ms_err}")
                # 当使用 ModelScope 路径失败时，回退到 Hugging Face 上的公开模型
                if hf_snapshot_download:
                    fallback = os.getenv("ASR_MODEL_FALLBACK", "FunAudioLLM/SenseVoiceSmall")
                    try:
                        model_dir = hf_snapshot_download(fallback)
                        # 将模型名切换为 Hugging Face 标识，便于 AutoModel 加载
                        self.model_name = fallback
                        logger.info(f"Model downloaded to (HuggingFace): {model_dir}")
                    except Exception as hf_err:
                        logger.error(f"HuggingFace fallback download failed for {fallback}: {hf_err}")
                        raise
                else:
                    raise
            
            # 加载模型
            device = "cpu" if self.use_cpu else "cuda"
            self.model = AutoModel(
                model=self.model_name,
                trust_remote_code=True,
                device=device,
                ncpu=4 if self.use_cpu else 1,
                # 流式推理配置
                batch_size=1,
            )
            
            logger.success(f"✅ ASR model loaded on {device}")
            
        except Exception as e:
            logger.error(f"Failed to load ASR model: {e}")
            raise
    
    async def transcribe_stream(
        self, 
        audio_chunk: bytes
    ) -> Optional[Dict]:
        """
        流式语音识别
        
        Args:
            audio_chunk: 音频数据 (PCM 16kHz mono)
            
        Returns:
            {
                "text": "识别文本",
                "is_final": False,  # 是否是最终结果
                "confidence": 0.95
            }
        """
        if self.model is None:
            raise RuntimeError("ASR model not loaded")
        
        try:
            # 转换为 numpy array
            audio_np = np.frombuffer(audio_chunk, dtype=np.int16)
            audio_float = audio_np.astype(np.float32) / 32768.0
            
            # 添加到缓冲区
            self.audio_buffer.append(audio_float)
            
            # 计算缓冲区时长
            total_samples = sum(len(buf) for buf in self.audio_buffer)
            duration_ms = (total_samples / self.sample_rate) * 1000
            
            # 如果缓冲区不足，返回空
            if duration_ms < self.buffer_duration_ms:
                return None
            
            # 合并缓冲区
            audio_data = np.concatenate(self.audio_buffer)
            self.audio_buffer = []
            
            # ASR 推理
            result = await asyncio.to_thread(
                self._run_inference,
                audio_data
            )
            
            return result
            
        except Exception as e:
            logger.error(f"ASR transcription error: {e}")
            return None
    
    def _run_inference(self, audio_data: np.ndarray) -> Dict:
        """同步推理方法 (在线程池中运行)"""
        try:
            # FunASR 推理
            res = self.model.generate(
                input=audio_data,
                batch_size=1,
                language="auto",  # 自动检测语言
                use_itn=True,     # 使用逆文本归一化
            )
            
            if res and len(res) > 0:
                text = res[0].get("text", "")
                
                # 判断是否是最终结果 (简单策略: 文本长度 > 3)
                is_final = len(text) > 3
                
                return {
                    "text": text,
                    "is_final": is_final,
                    "confidence": 0.9,  # FunASR 不直接提供置信度
                    "language": res[0].get("lang", "zh"),
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Inference error: {e}")
            return None
    
    async def transcribe_file(self, audio_file: str) -> str:
        """转写音频文件 (非流式)"""
        if self.model is None:
            raise RuntimeError("ASR model not loaded")
        
        try:
            result = await asyncio.to_thread(
                self.model.generate,
                input=audio_file,
                batch_size=1,
                language="auto",
                use_itn=True,
            )
            
            if result and len(result) > 0:
                return result[0].get("text", "")
            
            return ""
            
        except Exception as e:
            logger.error(f"File transcription error: {e}")
            return ""
    
    async def cleanup(self):
        """清理资源"""
        self.audio_buffer = []
        if self.model:
            del self.model
            self.model = None
        logger.info("ASR service cleaned up")


# ============================================
# 🎤 使用示例
# ============================================
"""
# 初始化
asr = ASRService()
await asr.load_model()

# 流式识别
audio_chunk = b'...'  # PCM 16kHz mono
result = await asr.transcribe_stream(audio_chunk)
if result:
    print(f"识别: {result['text']}, 最终: {result['is_final']}")

# 文件识别
text = await asr.transcribe_file("audio.wav")
print(f"文本: {text}")
"""

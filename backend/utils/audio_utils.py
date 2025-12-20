#!/usr/bin/env python3
"""
音频处理工具
处理音频格式转换、重采样等
"""

import numpy as np
from typing import Optional
from loguru import logger

try:
    import librosa
    import soundfile as sf
except ImportError:
    logger.warning("Audio libraries not installed")
    librosa = None
    sf = None


class AudioProcessor:
    """音频处理器"""
    
    def __init__(self):
        self.target_sample_rate_asr = 16000  # ASR 要求 16kHz
        self.target_sample_rate_tts = 24000  # TTS 输出 24kHz
    
    def process_input_audio(
        self,
        audio_bytes: bytes,
        source_sample_rate: int = 24000,
        source_channels: int = 1
    ) -> bytes:
        """
        处理输入音频 (前端 → ASR)
        
        Args:
            audio_bytes: 原始音频数据 (PCM)
            source_sample_rate: 源采样率
            source_channels: 源声道数
            
        Returns:
            处理后的音频 (PCM 16kHz mono)
        """
        try:
            # 转换为 numpy array
            audio_np = np.frombuffer(audio_bytes, dtype=np.int16)
            
            # 转为 float32
            audio_float = audio_np.astype(np.float32) / 32768.0
            
            # 如果是立体声，转为单声道
            if source_channels == 2:
                audio_float = audio_float.reshape(-1, 2).mean(axis=1)
            
            # 重采样到 16kHz (ASR 要求)
            if source_sample_rate != self.target_sample_rate_asr:
                if librosa is None:
                    logger.warning("librosa not installed, skipping resampling")
                else:
                    audio_float = librosa.resample(
                        audio_float,
                        orig_sr=source_sample_rate,
                        target_sr=self.target_sample_rate_asr
                    )
            
            # 转回 int16
            audio_int16 = (audio_float * 32768.0).astype(np.int16)
            
            return audio_int16.tobytes()
            
        except Exception as e:
            logger.error(f"Audio processing error: {e}")
            return audio_bytes
    
    def process_output_audio(
        self,
        audio_bytes: bytes,
        target_sample_rate: int = 24000
    ) -> bytes:
        """
        处理输出音频 (TTS → 前端)
        
        Args:
            audio_bytes: TTS 输出音频 (PCM 24kHz)
            target_sample_rate: 目标采样率
            
        Returns:
            处理后的音频
        """
        try:
            # 如果采样率已经匹配，直接返回
            if target_sample_rate == self.target_sample_rate_tts:
                return audio_bytes
            
            # 转换为 numpy
            audio_np = np.frombuffer(audio_bytes, dtype=np.int16)
            audio_float = audio_np.astype(np.float32) / 32768.0
            
            # 重采样
            if librosa:
                audio_float = librosa.resample(
                    audio_float,
                    orig_sr=self.target_sample_rate_tts,
                    target_sr=target_sample_rate
                )
            
            # 转回 int16
            audio_int16 = (audio_float * 32768.0).astype(np.int16)
            
            return audio_int16.tobytes()
            
        except Exception as e:
            logger.error(f"Audio processing error: {e}")
            return audio_bytes
    
    def load_audio_file(self, file_path: str) -> tuple:
        """
        加载音频文件
        
        Returns:
            (audio_data, sample_rate)
        """
        if sf is None:
            raise RuntimeError("soundfile not installed")
        
        try:
            audio, sr = sf.read(file_path, dtype='float32')
            return audio, sr
        except Exception as e:
            logger.error(f"Failed to load audio file: {e}")
            raise
    
    def save_audio_file(
        self,
        audio_data: np.ndarray,
        file_path: str,
        sample_rate: int = 24000
    ):
        """保存音频文件"""
        if sf is None:
            raise RuntimeError("soundfile not installed")
        
        try:
            sf.write(file_path, audio_data, sample_rate)
            logger.info(f"Audio saved to {file_path}")
        except Exception as e:
            logger.error(f"Failed to save audio file: {e}")
            raise


# ============================================
# 🎵 使用示例
# ============================================
"""
processor = AudioProcessor()

# 处理输入音频 (前端 → ASR)
audio_bytes = b'...'  # 来自前端的 PCM 数据
processed = processor.process_input_audio(
    audio_bytes,
    source_sample_rate=24000
)

# 加载音频文件
audio, sr = processor.load_audio_file("input.wav")

# 保存音频
processor.save_audio_file(audio, "output.wav", 24000)
"""

#!/usr/bin/env python3
"""
本地语音对话服务 - 主服务入口
支持 WebSocket 实时流式 ASR + TTS
"""

import asyncio
import json
import logging
import os
from typing import Dict, Optional
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from loguru import logger
import base64

# 服务模块 (后续实现)
from services.asr_service import ASRService
from services.tts_service import TTSService
from services.llm_service import LLMService
from utils.audio_utils import AudioProcessor

# 配置日志
logger.add(
    "logs/server_{time}.log",
    rotation="1 day",
    retention="7 days",
    level="INFO"
)

app = FastAPI(title="Local Voice Agent API")

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局服务实例
asr_service: Optional[ASRService] = None
tts_service: Optional[TTSService] = None
llm_service: Optional[LLMService] = None
audio_processor: AudioProcessor = AudioProcessor()

# 活跃连接管理
active_connections: Dict[str, WebSocket] = {}


@app.on_event("startup")
async def startup_event():
    """启动时初始化模型"""
    global asr_service, tts_service, llm_service
    
    logger.info("🚀 Starting Local Voice Agent Server...")
    
    try:
        # 初始化 ASR 服务
        logger.info("Loading ASR model...")
        asr_service = ASRService()
        await asr_service.load_model()
        logger.success("✅ ASR model loaded")
        
        # 初始化 TTS 服务
        logger.info("Loading TTS model...")
        tts_service = TTSService()
        await tts_service.load_model()
        logger.success("✅ TTS model loaded")
        
        # 初始化 LLM 服务 (远程 API)
        logger.info("Initializing LLM service...")
        llm_service = LLMService()
        logger.success("✅ LLM service initialized")
        
        logger.success("🎉 All services ready!")
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize services: {e}")
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """关闭时清理资源"""
    logger.info("Shutting down services...")
    if asr_service:
        await asr_service.cleanup()
    if tts_service:
        await tts_service.cleanup()


@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "services": {
            "asr": asr_service is not None,
            "tts": tts_service is not None,
            "llm": llm_service is not None,
        },
        "timestamp": datetime.now().isoformat()
    }


@app.get("/")
async def root_metadata():
    """根路由：返回 API 元数据与端点映射（与前端集成文档一致）。"""
    return {
        "message": "Voice Assistant Backend API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "websocket": "/ws/voice",
            "api": {
                "voice": "/api/voice",
                "voice_stream": "/api/voice/stream",
                "asr": "/api/asr",
                "llm": "/api/llm",
                "tts": "/api/tts",
            },
        },
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 主连接 - 处理实时语音对话"""
    client_id = f"client_{datetime.now().timestamp()}"
    await websocket.accept()
    active_connections[client_id] = websocket
    
    logger.info(f"✅ Client {client_id} connected")
    
    # 会话状态
    session = {
        "asr_buffer": [],
        "conversation_history": [],
        "is_speaking": False,
    }
    
    try:
        # 发送连接成功消息
        await websocket.send_json({
            "type": "session.created",
            "session_id": client_id,
            "capabilities": ["asr", "tts", "llm"]
        })
        
        # 主消息循环
        while True:
            # 接收客户端消息
            data = await websocket.receive()
            
            # 处理二进制音频数据
            if "bytes" in data:
                await handle_audio_input(
                    websocket, client_id, data["bytes"], session
                )
            
            # 处理 JSON 文本消息
            elif "text" in data:
                message = json.loads(data["text"])
                await handle_text_message(
                    websocket, client_id, message, session
                )
                
    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected")
    except Exception as e:
        logger.error(f"Error in WebSocket connection: {e}")
    finally:
        if client_id in active_connections:
            del active_connections[client_id]


@app.websocket("/ws/voice")
async def websocket_voice(websocket: WebSocket):
    """WebSocket 别名，按 Frontend Integration Guide 的消息格式进行交互。

    - 接收二进制音频分片（MediaRecorder data），进行 ASR 并发送 {type: 'asr', content: {text}}。
    - 进行 LLM 流式生成，发送 {type: 'llm', content: {text, partial}}。
    - 进行 TTS 流式生成，发送 {type: 'tts', content: {audio}}，其中 audio 为 base64 编码字节。
    - 支持控制命令：clear、ping。
    """
    client_id = f"client_{datetime.now().timestamp()}"
    await websocket.accept()
    active_connections[client_id] = websocket

    logger.info(f"✅ [/ws/voice] Client {client_id} connected")

    session = {
        "asr_buffer": [],
        "conversation_history": [],
        "is_speaking": False,
    }

    try:
        while True:
            data = await websocket.receive()
            if "bytes" in data:
                # 音频输入 → ASR
                try:
                    audio_chunk = audio_processor.process_input_audio(data["bytes"])
                    asr_result = await asr_service.transcribe_stream(audio_chunk)
                    if asr_result and asr_result.get("text"):
                        text = asr_result["text"]
                        is_final = asr_result.get("is_final", False)
                        # 发送 ASR 结果
                        await websocket.send_json({
                            "type": "asr",
                            "content": {"text": text},
                            "timestamp": datetime.now().timestamp(),
                        })
                        if is_final:
                            session["conversation_history"].append({"role": "user", "content": text})
                            asyncio.create_task(handle_llm_and_tts_voice(websocket, client_id, text, session))
                except Exception as e:
                    logger.error(f"[/ws/voice] audio error: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "content": {"message": str(e)},
                        "timestamp": datetime.now().timestamp(),
                    })
            elif "text" in data:
                try:
                    message = json.loads(data["text"]) if data["text"] else {}
                except Exception:
                    message = {}
                # 控制命令
                cmd = message.get("command")
                if cmd == "clear":
                    session["conversation_history"] = []
                    await websocket.send_json({
                        "type": "control",
                        "content": {"message": "Conversation cleared"},
                        "timestamp": datetime.now().timestamp(),
                    })
                elif cmd == "ping":
                    await websocket.send_json({
                        "type": "control",
                        "content": {"message": "pong"},
                        "timestamp": datetime.now().timestamp(),
                    })
                elif message.get("type") == "input_text":
                    text = message.get("text", "")
                    if text:
                        session["conversation_history"].append({"role": "user", "content": text})
                        await handle_llm_and_tts_voice(websocket, client_id, text, session)
    except WebSocketDisconnect:
        logger.info(f"[/ws/voice] Client {client_id} disconnected")
    except Exception as e:
        logger.error(f"[/ws/voice] error: {e}")
    finally:
        if client_id in active_connections:
            del active_connections[client_id]


async def handle_llm_and_tts_voice(
    websocket: WebSocket,
    client_id: str,
    user_text: str,
    session: dict,
):
    """按前端集成文档的格式发送 LLM/TTS。"""
    try:
        response_text = ""
        async for chunk in llm_service.chat_stream(messages=session["conversation_history"]):
            response_text += chunk
            await websocket.send_json({
                "type": "llm",
                "content": {"text": chunk, "partial": True},
                "timestamp": datetime.now().timestamp(),
            })
        # 完整 LLM 回复
        session["conversation_history"].append({"role": "assistant", "content": response_text})
        await websocket.send_json({
            "type": "llm",
            "content": {"text": response_text, "partial": False},
            "timestamp": datetime.now().timestamp(),
        })

        # TTS 流式音频（JSON base64）
        session["is_speaking"] = True
        async for audio_chunk in tts_service.synthesize_stream(response_text):
            if not session["is_speaking"]:
                break
            b64 = base64.b64encode(audio_chunk).decode("ascii")
            await websocket.send_json({
                "type": "tts",
                "content": {"audio": b64},
                "timestamp": datetime.now().timestamp(),
            })
        session["is_speaking"] = False
    except Exception as e:
        logger.error(f"[/ws/voice] llm/tts error: {e}")
        await websocket.send_json({
            "type": "error",
            "content": {"message": str(e)},
            "timestamp": datetime.now().timestamp(),
        })


@app.post("/api/asr")
async def api_asr(payload: dict = Body(...)):
    """ASR REST：接收 base64 音频，返回文本。"""
    try:
        b64 = payload.get("audio_data")
        if not b64:
            return JSONResponse(status_code=400, content={"success": False, "error": "audio_data required"})
        audio_bytes = base64.b64decode(b64)
        audio_chunk = audio_processor.process_input_audio(audio_bytes)
        result = await asr_service.transcribe_stream(audio_chunk)
        text = result.get("text", "") if result else ""
        return {"text": text, "success": True}
    except Exception as e:
        logger.error(f"/api/asr error: {e}")
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/llm")
async def api_llm(payload: dict = Body(...)):
    """LLM REST：接收 messages，返回生成文本。"""
    try:
        messages = payload.get("messages") or []
        # 可选参数，不一定被底层使用
        # temperature = payload.get("temperature")
        # max_tokens = payload.get("max_tokens")
        content = ""
        async for chunk in llm_service.chat_stream(messages=messages):
            content += chunk
        return {"content": content, "success": True}
    except Exception as e:
        logger.error(f"/api/llm error: {e}")
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/tts")
async def api_tts(payload: dict = Body(...)):
    """TTS REST：接收文本与可选发音人，返回 base64 音频。"""
    try:
        text = payload.get("text") or ""
        if not text:
            return JSONResponse(status_code=400, content={"success": False, "error": "text required"})
        audio_bytes = b""
        async for audio_chunk in tts_service.synthesize_stream(text):
            audio_bytes += audio_chunk
        b64 = base64.b64encode(audio_bytes).decode("ascii")
        return {"audio_data": b64, "success": True}
    except Exception as e:
        logger.error(f"/api/tts error: {e}")
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.post("/api/voice/stream")
async def api_voice_stream(request):
    """Unified streaming endpoint: audio in (raw bytes), NDJSON frames out.

    Frames:
    {"type": "asr", "text": "..."}
    {"type": "llm", "text": "...", "partial": true/false}
    {"type": "tts", "audio": "base64_pcm16"}
    {"type": "done"}
    {"type": "error", "message": "..."}
    """
    async def frame_stream():
        try:
            body = await request.body()
            if not body:
                yield json.dumps({"type": "error", "message": "empty audio"}) + "\n"
                return

            audio_chunk = audio_processor.process_input_audio(body)
            asr_result = await asr_service.transcribe_stream(audio_chunk)
            if asr_result and asr_result.get("text"):
                yield json.dumps({"type": "asr", "text": asr_result["text"]}) + "\n"
            user_text = asr_result.get("text", "") if asr_result else ""

            # LLM streaming
            llm_acc = ""
            async for chunk in llm_service.chat_stream(messages=[{"role": "user", "content": user_text}]):
                llm_acc += chunk
                yield json.dumps({"type": "llm", "text": chunk, "partial": True}) + "\n"
            yield json.dumps({"type": "llm", "text": llm_acc, "partial": False}) + "\n"

            # TTS streaming
            async for audio_bytes in tts_service.synthesize_stream(llm_acc):
                b64 = base64.b64encode(audio_bytes).decode("ascii")
                yield json.dumps({"type": "tts", "audio": b64}) + "\n"

            yield json.dumps({"type": "done"}) + "\n"
        except Exception as e:
            logger.error(f"/api/voice/stream error: {e}")
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"

    return StreamingResponse(frame_stream(), media_type="application/x-ndjson")


async def handle_audio_input(
    websocket: WebSocket,
    client_id: str,
    audio_bytes: bytes,
    session: dict
):
    """处理音频输入 - 实时 ASR"""
    try:
        # 1. 音频预处理
        audio_chunk = audio_processor.process_input_audio(audio_bytes)
        
        # 2. ASR 实时转写
        asr_result = await asr_service.transcribe_stream(audio_chunk)
        
        if asr_result and asr_result.get("text"):
            text = asr_result["text"]
            is_final = asr_result.get("is_final", False)
            
            # 发送 ASR 结果给前端
            await websocket.send_json({
                "type": "asr.transcript",
                "text": text,
                "is_final": is_final,
                "timestamp": datetime.now().isoformat()
            })
            
            # 如果是最终结果，触发 LLM 对话
            if is_final:
                session["conversation_history"].append({
                    "role": "user",
                    "content": text
                })
                
                # 异步处理 LLM + TTS
                asyncio.create_task(
                    handle_llm_and_tts(websocket, client_id, text, session)
                )
                
    except Exception as e:
        logger.error(f"Error processing audio: {e}")
        await websocket.send_json({
            "type": "error",
            "message": str(e)
        })


async def handle_text_message(
    websocket: WebSocket,
    client_id: str,
    message: dict,
    session: dict
):
    """处理文本消息"""
    msg_type = message.get("type")
    
    if msg_type == "session.update":
        # 更新会话配置
        logger.info(f"Session config updated: {message}")
        await websocket.send_json({
            "type": "session.updated",
            "session": message.get("session", {})
        })
        
    elif msg_type == "input_text":
        # 直接文本输入 (不经过 ASR)
        text = message.get("text", "")
        session["conversation_history"].append({
            "role": "user",
            "content": text
        })
        await handle_llm_and_tts(websocket, client_id, text, session)
        
    elif msg_type == "cancel":
        # 取消当前生成
        session["is_speaking"] = False
        logger.info("Generation cancelled by user")


async def handle_llm_and_tts(
    websocket: WebSocket,
    client_id: str,
    user_text: str,
    session: dict
):
    """处理 LLM 对话 + TTS 流式合成"""
    try:
        # 1. LLM 生成回复 (流式)
        response_text = ""
        
        async for chunk in llm_service.chat_stream(
            messages=session["conversation_history"]
        ):
            response_text += chunk
            
            # 发送 LLM 文本流
            await websocket.send_json({
                "type": "llm.delta",
                "text": chunk,
                "timestamp": datetime.now().isoformat()
            })
        
        # 2. LLM 完成
        session["conversation_history"].append({
            "role": "assistant",
            "content": response_text
        })
        
        await websocket.send_json({
            "type": "llm.done",
            "text": response_text
        })
        
        # 3. TTS 流式生成音频
        session["is_speaking"] = True
        
        async for audio_chunk in tts_service.synthesize_stream(response_text):
            if not session["is_speaking"]:
                break  # 用户取消
                
            # 发送音频块给前端
            await websocket.send_bytes(audio_chunk)
        
        # 4. TTS 完成
        await websocket.send_json({
            "type": "tts.done",
            "timestamp": datetime.now().isoformat()
        })
        
        session["is_speaking"] = False
        
    except Exception as e:
        logger.error(f"Error in LLM/TTS pipeline: {e}")
        await websocket.send_json({
            "type": "error",
            "message": str(e)
        })


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    
    logger.info(f"🚀 Starting server on port {port}")
    logger.info(f"   WebSocket endpoint: ws://localhost:{port}/ws")
    logger.info(f"   WebSocket (voice) : ws://localhost:{port}/ws/voice")
    logger.info(f"   Root metadata     : http://localhost:{port}/")
    logger.info(f"   Health check: http://localhost:{port}/health")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
        access_log=True
    )

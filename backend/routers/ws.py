import asyncio
import json
import time
import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# 活跃的 WebSocket 连接
active_connections: dict[int, list[WebSocket]] = {}


@router.websocket("/ws/video/{stream_id}")
async def video_websocket(websocket: WebSocket, stream_id: int):
    await websocket.accept()
    if stream_id not in active_connections:
        active_connections[stream_id] = []
    active_connections[stream_id].append(websocket)

    try:
        while True:
            # 等待客户端发送控制消息（帧率、开关等）
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        active_connections[stream_id].remove(websocket)
        if not active_connections[stream_id]:
            del active_connections[stream_id]


async def broadcast_detection(stream_id: int, result: dict):
    """广播检测结果到指定 stream 的所有 ws 连接"""
    if stream_id not in active_connections:
        return
    message = json.dumps(result)
    for ws in active_connections[stream_id]:
        try:
            await ws.send_text(message)
        except Exception:
            pass

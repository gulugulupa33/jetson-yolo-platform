import asyncio
import json
import time
import os
import psutil
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# 活跃的 WebSocket 连接（按 stream_id 分组，用于视频流）
video_connections: dict[int, list[WebSocket]] = {}

# 活跃的通用 WebSocket 连接（用于 stats 广播）
monitor_connections: list[WebSocket] = []

# Demo stats 文件路径
DEMO_STATS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data/demo_stats.json"
)


# ========== 视频流 WS（保持原有） ==========

@router.websocket("/ws/video/{stream_id}")
async def video_websocket(websocket: WebSocket, stream_id: int):
    await websocket.accept()
    if stream_id not in video_connections:
        video_connections[stream_id] = []
    video_connections[stream_id].append(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        video_connections[stream_id].remove(websocket)
        if not video_connections[stream_id]:
            del video_connections[stream_id]


async def broadcast_detection(stream_id: int, result: dict):
    """广播检测结果到指定 stream 的所有 ws 连接"""
    if stream_id not in video_connections:
        return
    message = json.dumps(result)
    for ws in video_connections[stream_id]:
        try:
            await ws.send_text(message)
        except Exception:
            pass


# ========== 通用监控 WS（前端仪表盘/监控页使用） ==========

@router.websocket("/ws")
async def monitor_websocket(websocket: WebSocket):
    """通用 WebSocket 端点：
    - 连接后自动推送实时 stats
    - 前端 ws 客户端订阅 'stats', 'log' 等事件
    """
    await websocket.accept()
    monitor_connections.append(websocket)

    try:
        while True:
            # 接收客户端消息（心跳等）
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type", "")
            
            if msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
            elif msg_type == "subscribe":
                # 客户端可订阅特定事件类型
                channels = msg.get("channels", ["stats", "log"])
                await websocket.send_text(json.dumps({
                    "type": "subscribed",
                    "payload": {"channels": channels}
                }))
    except (WebSocketDisconnect, json.JSONDecodeError):
        pass
    except Exception:
        pass
    finally:
        if websocket in monitor_connections:
            monitor_connections.remove(websocket)


async def broadcast_stats():
    """定期向所有 monitor WS 客户端推送统计数据（由 lifespan 启动）"""
    while True:
        if not monitor_connections:
            await asyncio.sleep(1)
            continue

        # 收集系统数据
        cpu_percent = psutil.cpu_percent(interval=0)
        memory = psutil.virtual_memory()

        # GPU 数据
        gpu = {"gpu_util": 0, "memory_used_mb": 0, "memory_total_mb": 0, "temperature_c": 0}
        try:
            import subprocess
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
                 "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=3
            )
            parts = result.stdout.strip().split(", ")
            def sf(v, d=0.0):
                try: return float(v)
                except: return d
            if len(parts) >= 4:
                mt = sf(parts[2], default=1.0)
                if mt <= 0: mt = max(sf(parts[1]), 1.0)
                gpu = {
                    "gpu_util": sf(parts[0]),
                    "memory_used_mb": sf(parts[1]),
                    "memory_total_mb": mt,
                    "temperature_c": sf(parts[3]),
                }
        except Exception:
            pass

        # Demo 推理数据
        demo_fps = 0
        demo_detections = 0
        try:
            if os.path.exists(DEMO_STATS_PATH):
                with open(DEMO_STATS_PATH) as f:
                    demo = json.load(f)
                    demo_fps = demo.get("fps", 0)
                    demo_detections = demo.get("detections", 0)
        except Exception:
            pass

        stats_payload = {
            "cpu": {"percent": cpu_percent},
            "memory": {
                "total_gb": round(memory.total / (1024**3), 1),
                "used_gb": round(memory.used / (1024**3), 1),
                "percent": memory.percent,
            },
            "gpu": gpu,
            "engines": {
                "count": 1 if demo_fps > 0 else 0,
                "total_fps": round(demo_fps, 1),
            },
            "demo": {
                "active": demo_fps > 0,
                "detections": demo_detections,
            },
            "timestamp": time.time(),
        }

        # 广播给所有 monitor 客户端
        message = json.dumps({"type": "stats", "payload": stats_payload})
        dead = []
        for ws in monitor_connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in monitor_connections:
                monitor_connections.remove(ws)

        await asyncio.sleep(2)  # 每 2 秒推送一次


async def broadcast_log(message: str, level: str = "info"):
    """广播日志消息"""
    if not monitor_connections:
        return
    payload = json.dumps({
        "type": "log",
        "payload": {"message": message, "level": level}
    })
    dead = []
    for ws in monitor_connections:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in monitor_connections:
            monitor_connections.remove(ws)

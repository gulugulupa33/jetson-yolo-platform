"""
MJPEG 视频流路由 — 用于大屏展示实时推理结果
从 data/frames/ 目录读取已标注的推理帧，以 MJPEG 多部分流方式推送
"""

import os
import asyncio
import time
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter()

# 帧文件路径
DATA_DIR = Path(__file__).parent.parent / "data"
FRAMES_DIR = DATA_DIR / "frames"
PLACEHOLDER_PATH = DATA_DIR / "placeholder.jpg"

# 占位帧（纯黑 + 文字）
PLACEHOLDER_BYTES = None


@router.get("/api/streams/{stream_id}/mjpeg")
async def mjpeg_stream(stream_id: int):
    """
    MJPEG 视频流端点
    持续读取 stream_{stream_id}.jpg 并以 multipart/x-mixed-replace 推送
    """
    frame_path = FRAMES_DIR / f"stream_{stream_id}.jpg"
    
    if not FRAMES_DIR.exists():
        FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    
    # 检查是否至少有一帧
    has_frame = frame_path.exists()
    
    async def generate():
        last_mtime = 0
        empty_count = 0
        while True:
            try:
                if frame_path.exists():
                    mtime = os.path.getmtime(str(frame_path))
                    if mtime != last_mtime:
                        last_mtime = mtime
                        frame_bytes = frame_path.read_bytes()
                        if len(frame_bytes) > 100:
                            empty_count = 0
                            yield (
                                b"--frame\r\n"
                                b"Content-Type: image/jpeg\r\n"
                                b"Content-Length: " + str(len(frame_bytes)).encode() + b"\r\n"
                                b"Cache-Control: no-cache, no-store, must-revalidate\r\n"
                                b"Pragma: no-cache\r\n"
                                b"\r\n" + frame_bytes + b"\r\n"
                            )
                            # 匹配推理节奏（~15fps ≈ 66ms per frame）
                            await asyncio.sleep(0.05)
                            continue
                else:
                    # 无帧文件：生成占位图
                    placeholder = _generate_placeholder(stream_id)
                    empty_count += 1
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n"
                        b"Content-Length: " + str(len(placeholder)).encode() + b"\r\n"
                        b"\r\n" + placeholder + b"\r\n"
                    )
                    await asyncio.sleep(1.0 if empty_count > 5 else 0.1)
                    continue
            except Exception:
                pass
            await asyncio.sleep(0.033)  # ~30fps polling
        
    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Access-Control-Allow-Origin": "*",
        }
    )


def _generate_placeholder(stream_id: int) -> bytes:
    """生成占位 JPEG（首次调用生成一次，后续复用）"""
    try:
        import numpy as np
        import cv2
        
        img = np.zeros((540, 960, 3), dtype=np.uint8)
        # 暗色背景
        img[:] = (10, 10, 20)
        # 边框
        cv2.rectangle(img, (1, 1), (958, 538), (40, 40, 80), 2)
        # 文字
        text = f"STREAM #{stream_id}"
        font = cv2.FONT_HERSHEY_SIMPLEX
        text_size = cv2.getTextSize(text, font, 1.5, 2)[0]
        tx = (960 - text_size[0]) // 2
        ty = (540 + text_size[1]) // 2 - 30
        cv2.putText(img, text, (tx, ty), font, 1.5, (60, 60, 120), 2, cv2.LINE_AA)
        cv2.putText(img, "等待视频源...", (tx + 20, ty + 40), font, 0.8, (80, 80, 100), 1, cv2.LINE_AA)
        
        ret, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if ret:
            return buf.tobytes()
    except Exception:
        pass
    return b""

import json
import logging
import time
import numpy as np
from typing import Optional
from services.engine_pool import engine_pool
from services.stream_manager import stream_manager
from routers.ws import broadcast_detection

logger = logging.getLogger(__name__)


def postprocess(outputs: list[np.ndarray], conf_threshold: float = 0.25) -> list[dict]:
    """YOLO 后处理：解析检测框、NMS"""
    detections = []
    if not outputs:
        return detections

    output = outputs[0]  # [1, 84, 8400] YOLOv8 format
    if output.ndim == 3:
        output = output[0]  # [84, 8400]

    # 转置: [84, 8400] -> [8400, 84]
    output = output.T

    # 过滤低置信度
    scores = output[:, 4:84].max(axis=1)
    mask = scores > conf_threshold
    if not mask.any():
        return detections

    filtered = output[mask]
    scores = scores[mask]
    class_ids = output[:, 4:84].argmax(axis=1)[mask]

    # 解析框
    for i in range(len(filtered)):
        xc, yc, w, h = filtered[i, :4]
        x1 = float(xc - w / 2)
        y1 = float(yc - h / 2)
        x2 = float(xc + w / 2)
        y2 = float(yc + h / 2)

        detections.append({
            "bbox": [x1, y1, x2, y2],
            "confidence": round(float(scores[i]), 3),
            "class_id": int(class_ids[i]),
        })

    return detections


async def process_stream(stream_id: int, model_id: int):
    """处理一路流的推理循环"""
    logger.info(f"Starting inference for stream {stream_id} with model {model_id}")

    # 找引擎
    engine_entry = None
    for eid, eng in engine_pool._engines.items():
        if eng.model_id == model_id:
            engine_entry = eng
            break

    if not engine_entry:
        logger.error(f"No engine loaded for model {model_id}")
        return

    engine = engine_entry.engine
    context = engine.create_execution_context()

    while True:
        frame = stream_manager.get_frame(stream_id)
        if frame is None:
            await __import__("asyncio").sleep(0.1)
            continue

        # 预处理
        input_tensor = frame.transpose(2, 0, 1)[np.newaxis, ...].astype(np.float32) / 255.0

        # 推理
        # outputs = engine.infer(input_tensor)
        # detections = postprocess(outputs)
        detections = []  # TODO: 真实推理需要 pycuda + tensorrt

        # 推送
        result = {
            "stream_id": stream_id,
            "timestamp": time.time(),
            "detections": detections,
            "fps": stream_manager.get_fps(stream_id),
        }
        await broadcast_detection(stream_id, result)

        await __import__("asyncio").sleep(0.05)

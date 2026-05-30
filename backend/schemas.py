from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ModelOut(BaseModel):
    id: int
    name: str
    filename: str
    architecture: Optional[str] = None
    status: str
    precision: str = "fp16"
    gpu_memory_mb: float = 0
    created_at: datetime
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class StreamOut(BaseModel):
    id: int
    name: str
    rtsp_url: str
    status: str = "inactive"
    fps_target: int = 15
    fps_actual: Optional[float] = None
    bind_model_id: Optional[int] = None
    deploy_mode: str = "shared"
    created_at: datetime

    class Config:
        from_attributes = True


class StreamCreate(BaseModel):
    name: str
    rtsp_url: str
    fps_target: int = 15
    resolution: str = "640x640"


class StreamBind(BaseModel):
    model_id: int
    deploy_mode: str = "shared"


class EngineStatus(BaseModel):
    engine_id: str
    model_name: str
    gpu_memory_mb: float
    streams_bound: int
    fps: float
    status: str


class DetectionResult(BaseModel):
    stream_id: int
    timestamp: float
    detections: list[dict]  # [{"bbox": [x1,y1,x2,y2], "class": str, "confidence": float}, ...]
    fps: float

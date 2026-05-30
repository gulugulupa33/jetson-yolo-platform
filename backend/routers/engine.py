from fastapi import APIRouter, Depends, HTTPException
from services.engine_pool import engine_pool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from services.database import get_session
from models.database import ModelRecord, StreamRecord
from schemas import EngineStatus
import os

router = APIRouter(tags=["engine"])


@router.get("/engines", response_model=list[EngineStatus])
async def list_engines():
    """前端使用的引擎列表（含 demo 回退）"""
    try:
        engines = engine_pool.get_status()
    except Exception:
        engines = []
    
    # 没有引擎时返回 demo 数据
    if not engines:
        demo_stats_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data/demo_stats.json"
        )
        try:
            import json
            with open(demo_stats_path) as f:
                demo = json.load(f)
            return [{
                "engine_id": "demo-1",
                "model_name": "yolov8n",
                "gpu_memory_mb": 0,
                "streams_bound": 1,
                "fps": demo.get("fps", 0),
                "status": "running",
            }]
        except Exception:
            pass
    
    return engines


@router.post("/engine/load/{model_id}")
async def load_engine(model_id: int, db: AsyncSession = Depends(get_session)):
    record = await db.get(ModelRecord, model_id)
    if not record:
        raise HTTPException(404, "Model not found")
    if not record.engine_path or not os.path.exists(record.engine_path):
        raise HTTPException(400, "Engine file not compiled yet")
    engine_id = await engine_pool.load_engine(record.engine_path, record.name)
    return {"engine_id": engine_id}


@router.post("/engine/unload/{engine_id}")
async def unload_engine(engine_id: str):
    await engine_pool.unload_engine(engine_id)
    return {"ok": True}


@router.get("/engine/status", response_model=list[EngineStatus])
async def engine_status():
    return engine_pool.get_status()

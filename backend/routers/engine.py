from fastapi import APIRouter, Depends, HTTPException
from services.engine_pool import engine_pool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from services.database import get_session
from models.database import ModelRecord, StreamRecord
from schemas import EngineStatus

router = APIRouter(tags=["engine"])


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

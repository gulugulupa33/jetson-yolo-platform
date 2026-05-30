import json
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from services.database import get_session
from models.database import StreamRecord
from schemas import StreamOut, StreamCreate, StreamBind

router = APIRouter(tags=["streams"])

# Demo stats 文件路径
DEMO_STATS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data/demo_stats.json"
)


def read_demo_fps() -> float | None:
    try:
        if os.path.exists(DEMO_STATS_PATH):
            with open(DEMO_STATS_PATH) as f:
                data = json.load(f)
                return data.get("fps")
    except Exception:
        pass
    return None


def enrich_with_demo(records: list) -> list[dict]:
    """为 stream 记录补充 demo 运行时的 fps_actual"""
    demo_fps = read_demo_fps()
    result = []
    for r in records:
        d = {
            "id": r.id,
            "name": r.name,
            "rtsp_url": r.rtsp_url,
            "status": r.status,
            "fps_target": r.fps_target,
            "fps_actual": demo_fps if demo_fps else None,
            "bind_model_id": r.bind_model_id,
            "deploy_mode": r.deploy_mode,
            "created_at": r.created_at.isoformat() if hasattr(r.created_at, 'isoformat') else str(r.created_at),
        }
        result.append(d)
    return result


@router.post("/streams")
async def create_stream(
    body: StreamCreate,
    db: AsyncSession = Depends(get_session)
):
    record = StreamRecord(
        name=body.name,
        rtsp_url=body.rtsp_url,
        fps_target=body.fps_target,
        resolution=body.resolution,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.get("/streams")
async def list_streams(db: AsyncSession = Depends(get_session)):
    result = await db.execute(
        select(StreamRecord).order_by(StreamRecord.created_at.desc())
    )
    records = result.scalars().all()
    return enrich_with_demo(records)


@router.get("/streams/{stream_id}")
async def get_stream(stream_id: int, db: AsyncSession = Depends(get_session)):
    record = await db.get(StreamRecord, stream_id)
    if not record:
        raise HTTPException(404, "Stream not found")
    return enrich_with_demo([record])[0]


@router.post("/streams/{stream_id}/start")
async def start_stream(stream_id: int, db: AsyncSession = Depends(get_session)):
    record = await db.get(StreamRecord, stream_id)
    if not record:
        raise HTTPException(404, "Stream not found")
    record.status = "running"
    await db.commit()
    return enrich_with_demo([record])[0]


@router.post("/streams/{stream_id}/stop")
async def stop_stream(stream_id: int, db: AsyncSession = Depends(get_session)):
    record = await db.get(StreamRecord, stream_id)
    if not record:
        raise HTTPException(404, "Stream not found")
    record.status = "inactive"
    await db.commit()
    return enrich_with_demo([record])[0]


@router.delete("/streams/{stream_id}")
async def delete_stream(stream_id: int, db: AsyncSession = Depends(get_session)):
    record = await db.get(StreamRecord, stream_id)
    if not record:
        raise HTTPException(404, "Stream not found")
    await db.delete(record)
    await db.commit()
    return {"ok": True}


@router.post("/streams/{stream_id}/bind")
async def bind_stream(
    stream_id: int,
    body: StreamBind,
    db: AsyncSession = Depends(get_session)
):
    record = await db.get(StreamRecord, stream_id)
    if not record:
        raise HTTPException(404, "Stream not found")
    record.bind_model_id = body.model_id
    record.deploy_mode = body.deploy_mode
    await db.commit()
    return enrich_with_demo([record])[0]

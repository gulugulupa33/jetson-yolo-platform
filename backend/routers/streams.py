from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from services.database import get_session
from models.database import StreamRecord
from schemas import StreamOut, StreamCreate, StreamBind

router = APIRouter(tags=["streams"])


@router.post("/streams", response_model=StreamOut)
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


@router.get("/streams", response_model=list[StreamOut])
async def list_streams(db: AsyncSession = Depends(get_session)):
    result = await db.execute(
        select(StreamRecord).order_by(StreamRecord.created_at.desc())
    )
    return result.scalars().all()


@router.get("/streams/{stream_id}", response_model=StreamOut)
async def get_stream(stream_id: int, db: AsyncSession = Depends(get_session)):
    record = await db.get(StreamRecord, stream_id)
    if not record:
        raise HTTPException(404, "Stream not found")
    return record


@router.delete("/streams/{stream_id}")
async def delete_stream(stream_id: int, db: AsyncSession = Depends(get_session)):
    record = await db.get(StreamRecord, stream_id)
    if not record:
        raise HTTPException(404, "Stream not found")
    await db.delete(record)
    await db.commit()
    return {"ok": True}


@router.put("/streams/{stream_id}/bind")
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
    return {"ok": True}


@router.put("/streams/{stream_id}/unbind")
async def unbind_stream(stream_id: int, db: AsyncSession = Depends(get_session)):
    record = await db.get(StreamRecord, stream_id)
    if not record:
        raise HTTPException(404, "Stream not found")
    record.bind_model_id = None
    await db.commit()
    return {"ok": True}

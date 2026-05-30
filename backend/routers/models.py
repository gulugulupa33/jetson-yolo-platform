import os
import asyncio
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from services.database import get_session
from models.database import ModelRecord
from schemas import ModelOut
from services.model_compiler import compile_model

router = APIRouter(tags=["models"])


@router.post("/models/upload", response_model=ModelOut)
async def upload_model(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session)
):
    if not file.filename.endswith(".pt"):
        raise HTTPException(400, "Only .pt weight files are supported")

    from config import MODELS_DIR
    os.makedirs(MODELS_DIR, exist_ok=True)
    filepath = os.path.join(str(MODELS_DIR), file.filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    record = ModelRecord(
        name=file.filename.replace(".pt", ""),
        filename=file.filename,
        pt_path=filepath,
        status="uploaded",
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    # 异步启动编译
    asyncio.create_task(compile_model(record.id))

    return record


@router.get("/models", response_model=list[ModelOut])
async def list_models(db: AsyncSession = Depends(get_session)):
    result = await db.execute(
        select(ModelRecord).order_by(ModelRecord.created_at.desc())
    )
    return result.scalars().all()


@router.get("/models/{model_id}", response_model=ModelOut)
async def get_model(model_id: int, db: AsyncSession = Depends(get_session)):
    record = await db.get(ModelRecord, model_id)
    if not record:
        raise HTTPException(404, "Model not found")
    return record


@router.delete("/models/{model_id}")
async def delete_model(model_id: int, db: AsyncSession = Depends(get_session)):
    record = await db.get(ModelRecord, model_id)
    if not record:
        raise HTTPException(404, "Model not found")
    for path in [record.pt_path, record.onnx_path, record.engine_path]:
        if path and os.path.exists(path):
            os.remove(path)
    await db.delete(record)
    await db.commit()
    return {"ok": True}

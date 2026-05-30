import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import models, streams, engine, stats, ws
from services.database import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    from services.engine_pool import engine_pool
    await engine_pool.shutdown()

app = FastAPI(
    title="Jetson YOLO Platform",
    description="YOLO model deployment platform for Jetson Nano / DGX Spark",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(models.router, prefix="/api")
app.include_router(streams.router, prefix="/api")
app.include_router(engine.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(ws.router)

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}

# Jetson YOLO 部署平台 — 实施计划

> **执行方式：** subagent-driven-development，每任务一个子代理，两阶段审查

**目标：** 构建一个 Docker 一键部署的 YOLO 推理平台，支持上传 .pt 权重、管理 RTSP 流、灵活部署模式、实时预览检测结果。

**架构：** FastAPI 后端 + Next.js 前端 + TensorRT 推理引擎池，Docker 容器化部署于 ARM64 + NVIDIA GPU。

**Tech Stack：** FastAPI, SQLite, TensorRT, PyAV, Next.js 14, shadcn/ui, Tailwind, Recharts, WebSocket

---

## Phase 1: 后端核心骨架

### Task 1: 项目初始化 + 目录结构

**Objective:** 创建后端项目骨架

**Files:**
- Create: `backend/main.py`
- Create: `backend/requirements.txt`
- Create: `backend/config.py`

**Step 1: 创建目录结构**

```bash
mkdir -p backend/{routers,services,models,utils}
touch backend/__init__.py
touch backend/routers/__init__.py
touch backend/services/__init__.py
touch backend/models/__init__.py
touch backend/utils/__init__.py
```

**Step 2: 创建 requirements.txt**

```
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
sqlalchemy[asyncio]>=2.0.0
aiosqlite>=0.19.0
websockets>=12.0
python-multipart>=0.0.9
pydantic>=2.0.0
numpy>=1.24.0
av>=10.0.0
opencv-python-headless>=4.9.0
tensorrt>=8.6.0
ultralytics>=8.0.0
pyyaml>=6.0
psutil>=5.9.0
```

**Step 3: 创建 config.py**

```python
import os
from pathlib import Path

ROOT = Path("/app")  # Docker 内路径，本地开发用 Path(__file__).parent.parent

MODELS_DIR = ROOT / "models"
ENGINES_DIR = ROOT / "engines"
CONFIG_DIR = ROOT / "config"
DB_PATH = ROOT / "data" / "jetson_yolo.db"

RTSP_RECONNECT_MAX_RETRIES = 5
RTSP_RECONNECT_DELAY = 2  # 初始延迟秒数

STREAM_FPS_DEFAULT = 15
STREAM_FPS_MIN = 1
STREAM_FPS_MAX = 30

WEBSOCKET_FRAME_INTERVAL = 0.1  # 100ms 推送间隔
```

**Step 4: 创建 main.py**

```python
import sys
sys.path.insert(0, str(Path(__file__).parent))

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import models, streams, engine, stats, ws
from services.engine_pool import EnginePool
from services.stream_manager import StreamManager
from services.dispatcher import Dispatcher

engine_pool = EnginePool()
stream_manager = StreamManager()
dispatcher = Dispatcher(engine_pool, stream_manager)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await engine_pool.load_persisted_engines()
    yield
    # shutdown
    await engine_pool.shutdown()
    await stream_manager.shutdown()

app = FastAPI(title="Jetson YOLO Platform", version="1.0.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(models.router, prefix="/api")
app.include_router(streams.router, prefix="/api")
app.include_router(engine.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(ws.router)

@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

**Step 5: 验证启动**

```bash
cd jetson-yolo-platform/backend
pip install -r requirements.txt
python -c "from main import app; print('Backend skeleton OK')"
```

**Step 6: Commit**

```bash
cd jetson-yolo-platform
git init
git add -A
git commit -m "feat: initialize backend skeleton"
```

---

### Task 2: 数据库模型

**Objective:** 定义 SQLAlchemy 模型（模型、流、部署配置）

**Files:**
- Create: `backend/models/database.py`
- Create: `backend/services/database.py`

**Step 1: 创建 database.py (models)**

```python
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON, Boolean
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import datetime
import json

class Base(AsyncAttrs, DeclarativeBase):
    pass

class ModelRecord(Base):
    __tablename__ = "models"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))  # 显示名称
    filename: Mapped[str] = mapped_column(String(256))  # 原始 .pt 文件名
    pt_path: Mapped[str] = mapped_column(String(512))
    onnx_path: Mapped[str] = mapped_column(String(512), nullable=True)
    engine_path: Mapped[str] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="uploaded")  # uploaded | compiling | ready | error
    architecture: Mapped[str] = mapped_column(String(64), nullable=True)  # yolov8n, yolov5s, ...
    precision: Mapped[str] = mapped_column(String(16), default="fp16")
    gpu_memory_mb: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)

class StreamRecord(Base):
    __tablename__ = "streams"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    rtsp_url: Mapped[str] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(32), default="inactive")  # inactive | connecting | running | error
    fps_target: Mapped[int] = mapped_column(Integer, default=15)
    resolution: Mapped[str] = mapped_column(String(16), default="640x640")
    bind_model_id: Mapped[int] = mapped_column(Integer, nullable=True)
    deploy_mode: Mapped[str] = mapped_column(String(32), default="shared")  # shared | dedicated
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    last_active: Mapped[datetime] = mapped_column(default=datetime.utcnow)

class DeploymentConfig(Base):
    __tablename__ = "deployment_configs"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    stream_model_map: Mapped[str] = mapped_column(Text)  # JSON: {stream_id: model_id}
    mode: Mapped[str] = mapped_column(String(32), default="hybrid")  # single_engine | multi_engine | hybrid
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
```

**Step 2: 创建 services/database.py**

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from models.database import Base
from config import DB_PATH

DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)

async def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_session():
    async with async_session() as session:
        yield session
```

**Step 3: 验证**

```bash
cd jetson-yolo-platform/backend
python -c "
import sys; sys.path.insert(0, '.')
import asyncio
from services.database import init_db
asyncio.run(init_db())
print('DB init OK')
"
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add database models and initialization"
```

---

## Phase 2: 模型管理 API

### Task 3: 模型上传 API

**Objective:** 实现 .pt 文件上传、列表、删除

**Files:**
- Create: `backend/routers/models.py`
- Create: `backend/schemas.py`

**Step 1: 创建 Pydantic schemas**

```python
# backend/schemas.py
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
    bind_model_id: Optional[int] = None
    deploy_mode: str = "shared"
    created_at: datetime
    fps_actual: Optional[float] = None
    
    class Config:
        from_attributes = True

class StreamCreate(BaseModel):
    name: str
    rtsp_url: str
    fps_target: int = 15
    resolution: str = "640x640"

class StreamBind(BaseModel):
    model_id: int
    deploy_mode: str = "shared"  # shared | dedicated

class EngineStatus(BaseModel):
    engine_id: str
    model_name: str
    gpu_memory_mb: float
    streams_bound: int
    fps: float
    status: str
```

**Step 2: 创建 routers/models.py**

```python
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from services.database import get_session, init_db
from models.database import ModelRecord
from schemas import ModelOut
from datetime import datetime
import aiofiles
import os

router = APIRouter(tags=["models"])
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "models")

@router.on_event("startup")
async def startup():
    await init_db()

@router.post("/models/upload", response_model=ModelOut)
async def upload_model(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session)
):
    if not file.filename.endswith(".pt"):
        raise HTTPException(400, "Only .pt files are supported")
    
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filepath = os.path.join(UPLOAD_DIR, file.filename)
    
    async with aiofiles.open(filepath, "wb") as f:
        content = await file.read()
        await f.write(content)
    
    record = ModelRecord(
        name=file.filename.replace(".pt", ""),
        filename=file.filename,
        pt_path=filepath,
        status="uploaded"
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record

@router.get("/models", response_model=list[ModelOut])
async def list_models(db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(ModelRecord).order_by(ModelRecord.created_at.desc()))
    return result.scalars().all()

@router.delete("/models/{model_id}")
async def delete_model(model_id: int, db: AsyncSession = Depends(get_session)):
    record = await db.get(ModelRecord, model_id)
    if not record:
        raise HTTPException(404, "Model not found")
    # Clean up files
    for path in [record.pt_path, record.onnx_path, record.engine_path]:
        if path and os.path.exists(path):
            os.remove(path)
    await db.delete(record)
    await db.commit()
    return {"ok": True}
```

**Step 3: 验证**

```bash
cd jetson-yolo-platform/backend
python -c "
import sys; sys.path.insert(0, '.')
from routers.models import router
print('Models router loaded OK')
"
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: model upload/list/delete API"
```

---

### Task 4: 模型编译服务

**Objective:** 实现 .pt → ONNX → TensorRT engine 异步编译流水线

**Files:**
- Create: `backend/services/model_compiler.py`

**Step 1: 创建 model_compiler.py**

```python
import asyncio
import os
import subprocess
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from models.database import ModelRecord
from services.database import async_session
from config import ENGINES_DIR

logger = logging.getLogger(__name__)

def get_gpu_architecture() -> str:
    """返回 GPU 架构名称，用于 TensorRT 编译优化"""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=10
        )
        name = result.stdout.strip()
        if "Blackwell" in name:
            return "blackwell"
        elif "Orin" in name or "AGX" in name:
            return "orin"
        elif "Nano" in name or "Maxwell" in name:
            return "maxwell"
        return "unknown"
    except:
        return "unknown"

async def compile_model(model_id: int):
    """异步编译模型: .pt → .onnx → .engine"""
    async with async_session() as db:
        record = await db.get(ModelRecord, model_id)
        if not record:
            logger.error(f"Model {model_id} not found")
            return
        
        try:
            record.status = "compiling"
            await db.commit()
            
            pt_path = record.pt_path
            base_name = os.path.splitext(record.filename)[0]
            onnx_path = pt_path.replace(".pt", ".onnx")
            engine_path = str(ENGINES_DIR / f"{base_name}.engine")
            
            os.makedirs(ENGINES_DIR, exist_ok=True)
            
            # Step 1: .pt → .onnx
            await asyncio.to_thread(
                lambda: subprocess.run([
                    "python3", "-c",
                    f"from ultralytics import YOLO; "
                    f"model = YOLO('{pt_path}'); "
                    f"model.export(format='onnx', imgsz=640, half=True)"
                ], check=True, capture_output=True, text=True, timeout=300)
            )
            
            # Find generated ONNX (ultralytics saves alongside .pt)
            generated_onnx = pt_path.replace(".pt", ".onnx")
            if os.path.exists(generated_onnx):
                os.rename(generated_onnx, onnx_path)
            
            record.onnx_path = onnx_path
            await db.commit()
            
            # Step 2: .onnx → .engine
            gpu_arch = get_gpu_architecture()
            precision_flags = "--fp16"
            
            await asyncio.to_thread(
                lambda: subprocess.run([
                    "trtexec",
                    f"--onnx={onnx_path}",
                    f"--saveEngine={engine_path}",
                    precision_flags,
                    "--workspace=1024",
                    "--optShapes=input:1x3x640x640",
                    "--best"
                ], check=True, capture_output=True, text=True, timeout=600)
            )
            
            record.engine_path = engine_path
            record.status = "ready"
            await db.commit()
            
        except subprocess.CalledProcessError as e:
            record.status = "error"
            record.error_message = e.stderr[-500:] if e.stderr else str(e)
            await db.commit()
            logger.error(f"Compilation failed for model {model_id}: {e}")
        except Exception as e:
            record.status = "error"
            record.error_message = str(e)[-500:]
            await db.commit()
            logger.error(f"Unexpected error compiling model {model_id}: {e}")
```

**Step 2: 把编译加到上传流程中**

在 `routers/models.py` 的 upload_model 末尾添加：

```python
from services.model_compiler import compile_model
# 在返回前启动异步编译
asyncio.create_task(compile_model(record.id))
```

**Step 3: 验证**

```bash
cd jetson-yolo-platform/backend
python -c "
import sys; sys.path.insert(0, '.')
from services.model_compiler import compile_model, get_gpu_architecture
print(f'GPU arch: {get_gpu_architecture()}')
print('Compiler service loaded OK')
"
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: model compilation pipeline (.pt → ONNX → TensorRT)"
```

---

## Phase 3: 引擎层 + 流管理

### Task 5: EnginePool 引擎池

**Objective:** 管理 TensorRT engine 的加载/卸载/查询

**Files:**
- Create: `backend/services/engine_pool.py`

**Implementation details:**
- EnginePool 维护一个 dict: `{engine_id: {"model": ModelRecord, "engine": trt_engine, "streams": set[int], "fps": float}}`
- `load_engine(model_id)` — 从 .engine 文件加载 TensorRT runtime
- `unload_engine(engine_id)` — 卸载释放显存
- `get_status()` — 返回所有引擎状态
- TensorRT 引擎加载使用 `tensorrt.Runtime` 反序列化 .engine 文件

```python
# 关键代码框架
import tensorrt as trt
import pycuda.driver as cuda
import pycuda.autoinit

class EnginePool:
    def __init__(self):
        self.logger = trt.Logger(trt.Logger.WARNING)
        self.engines: dict[str, dict] = {}
    
    def load_from_file(self, engine_path: str, model_id: int) -> str:
        with open(engine_path, "rb") as f:
            runtime = trt.Runtime(self.logger)
            engine = runtime.deserialize_cuda_engine(f.read())
        
        engine_id = f"engine_{model_id}_{os.path.basename(engine_path)}"
        # Create execution context
        context = engine.create_execution_context()
        
        # Allocate GPU buffers
        # ...
        
        self.engines[engine_id] = {
            "engine": engine,
            "context": context,
            "model_id": model_id,
            "streams": set(),
            "fps": 0.0,
        }
        return engine_id
    
    def unload(self, engine_id: str):
        if engine_id in self.engines:
            # Free GPU memory
            del self.engines[engine_id]
```

---

### Task 6: StreamManager 流管理

**Objective:** 管理 RTSP 拉流连接

**Files:**
- Create: `backend/services/stream_manager.py`
- 使用 `av` 或 `cv2.VideoCapture` 拉 RTSP 流
- 支持自动重连（指数退避）
- 每路流独立线程/协程

---

### Task 7: Dispatcher 调度器

**Objective:** 按配置将流分发给引擎

**Files:**
- Create: `backend/services/dispatcher.py`
- 读 `stream_model_map` 配置
- 支持三种模式切换
- 路由帧到对应引擎推理

---

### Task 8: RTSP 流管理 API

**Objective:** 流的 CRUD + 绑定配置

**Files:**
- Modify: `backend/routers/streams.py`
- 添加/删除/配置 RTSP 流
- 绑定/解绑模型

---

## Phase 4: WebSocket + 监控

### Task 9: WebSocket 实时推送

**Objective:** 实时推送检测结果到前端

**Files:**
- Create: `backend/routers/ws.py`
- WebSocket 端点 `/ws/video/{stream_id}`
- 帧检测结果推送（检测框坐标 + 类别 + 置信度）
- 可选 JPEG 帧推送（控制频率，默认 10fps）

---

### Task 10: 系统监控 API

**Objective:** GPU/CPU/内存/FPS 监控

**Files:**
- Create: `backend/services/stats_collector.py`
- Create: `backend/routers/stats.py`
- nvidia-smi 解析 GPU 使用率
- psutil 获取 CPU/内存
- `GET /api/stats` 返回聚合数据

---

## Phase 5: 前端

### Task 11: Next.js 项目初始化

**Objective:** 创建前端项目

```bash
cd jetson-yolo-platform
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --no-import-alias
cd frontend
npm install shadcn-ui recharts zustand lucide-react @radix-ui/react-tabs
npx shadcn-ui@latest init -d
```

### Task 12: 仪表盘页面

**Files:** `frontend/src/app/dashboard/page.tsx`
- 总览卡片（在线模型数、运行中流数、GPU 利用率）
- 实时预览网格（Canvas 渲染 + 检测框覆盖）
- 事件日志

### Task 13: 模型管理页面

**Files:** `frontend/src/app/models/page.tsx`
- 拖拽上传 .pt
- 模型列表卡片 + 状态标签
- 删除确认

### Task 14: 部署配置页面

**Files:** `frontend/src/app/deploy/page.tsx`
- RTSP 地址添加
- 模型绑定下拉
- 部署模式选择

### Task 15: 监控页面

**Files:** `frontend/src/app/monitor/page.tsx`
- Recharts 实时曲线
- GPU/CPU/内存/温度

---

## Phase 6: Docker + 部署

### Task 16: Dockerfile

**Files:** `Dockerfile`
- 多阶段构建
- ARM64 基座
- 安装 TensorRT + OpenCV + PyAV

### Task 17: docker-compose.yml + Nginx

**Files:** `docker-compose.yml`, `nginx.conf`
- 服务编排
- 反向代理 + 静态文件托管

---

## 执行方式

计划完成。建议按以下方式执行：

1. 使用 **subagent-driven-development** — 每个 Task 分配一个子代理
2. 子代理包含：Task 描述 + 完整上下文（文件路径、代码模板、验证命令）
3. 两阶段审查：**Spec 合规** → **代码质量**
4. Phase 1-4 可串行，Phase 5 后端完成后可并行启动前端子代理

需要我开始执行吗？

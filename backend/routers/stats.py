import psutil
import subprocess
import json
import os
from fastapi import APIRouter

router = APIRouter(tags=["stats"])

# Demo stats 文件路径
DEMO_STATS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data/demo_stats.json"
)


def get_gpu_stats() -> dict:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        parts = result.stdout.strip().split(", ")

        def safe_float(v: str, default: float = 0.0) -> float:
            try:
                return float(v)
            except (ValueError, TypeError):
                return default

        gpu_util = safe_float(parts[0]) if len(parts) > 0 else 0
        mem_used = safe_float(parts[1]) if len(parts) > 1 else 0
        mem_total = safe_float(parts[2], default=1.0) if len(parts) > 2 else 1.0
        temp = safe_float(parts[3]) if len(parts) > 3 else 0

        # 统一内存架构下 total 可能为 0 或 Not Supported
        if mem_total <= 0:
            mem_total = max(mem_used, 1.0)

        return {
            "gpu_util": gpu_util,
            "memory_used_mb": mem_used,
            "memory_total_mb": mem_total,
            "temperature_c": temp,
        }
    except Exception:
        return {"gpu_util": 0, "memory_used_mb": 0, "memory_total_mb": 0, "temperature_c": 0}


def read_demo_stats() -> dict | None:
    try:
        if os.path.exists(DEMO_STATS_PATH):
            with open(DEMO_STATS_PATH) as f:
                return json.load(f)
    except Exception:
        pass
    return None


@router.get("/stats")
async def get_stats():
    cpu_percent = psutil.cpu_percent(interval=0.5)
    memory = psutil.virtual_memory()
    gpu = get_gpu_stats()

    try:
        from services.engine_pool import engine_pool
        engines = engine_pool.get_status()
        total_fps = sum(e["fps"] for e in engines)
        engine_count = len(engines)
    except Exception:
        engines = []
        total_fps = 0
        engine_count = 0

    demo = read_demo_stats()
    if demo and engine_count == 0:
        total_fps = demo.get("fps", 0)
        demo_detections = demo.get("detections", 0)
    else:
        demo_detections = 0

    return {
        "cpu": {"percent": cpu_percent},
        "memory": {
            "total_gb": round(memory.total / (1024**3), 1),
            "used_gb": round(memory.used / (1024**3), 1),
            "percent": memory.percent,
        },
        "gpu": gpu,
        "engines": {
            "count": engine_count,
            "total_fps": round(total_fps, 1),
        },
        "demo": {
            "active": demo is not None,
            "detections": demo_detections if demo else 0,
        },
        "timestamp": __import__("time").time(),
    }

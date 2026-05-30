import psutil
import subprocess
import json
from fastapi import APIRouter

router = APIRouter(tags=["stats"])


def get_gpu_stats() -> dict:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        parts = result.stdout.strip().split(", ")
        return {
            "gpu_util": float(parts[0]) if len(parts) > 0 else 0,
            "memory_used_mb": float(parts[1]) if len(parts) > 1 else 0,
            "memory_total_mb": float(parts[2]) if len(parts) > 2 else 0,
            "temperature_c": float(parts[3]) if len(parts) > 3 else 0,
        }
    except Exception:
        return {"gpu_util": 0, "memory_used_mb": 0, "memory_total_mb": 0, "temperature_c": 0}


@router.get("/stats")
async def get_stats():
    cpu_percent = psutil.cpu_percent(interval=0.5)
    memory = psutil.virtual_memory()
    gpu = get_gpu_stats()

    # 引擎池 FPS 汇总
    from services.engine_pool import engine_pool
    engines = engine_pool.get_status()
    total_fps = sum(e["fps"] for e in engines)

    return {
        "cpu": {"percent": cpu_percent},
        "memory": {
            "total_gb": round(memory.total / (1024**3), 1),
            "used_gb": round(memory.used / (1024**3), 1),
            "percent": memory.percent,
        },
        "gpu": gpu,
        "engines": {
            "count": len(engines),
            "total_fps": round(total_fps, 1),
        },
        "timestamp": __import__("time").time(),
    }

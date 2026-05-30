import asyncio
import os
import subprocess
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from models.database import ModelRecord
from services.database import async_session
from config import ENGINES_DIR, ONNX_EXPORT_TIMEOUT, TRT_BUILD_TIMEOUT

logger = logging.getLogger(__name__)


def get_gpu_architecture() -> str:
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
    except Exception:
        return "unknown"


async def compile_model(model_id: int):
    """异步编译模型: .pt → .onnx → TensorRT .engine"""
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
            logger.info(f"Exporting {pt_path} to ONNX...")
            await asyncio.to_thread(
                lambda: subprocess.run(
                    [
                        "python3", "-c",
                        f"from ultralytics import YOLO; "
                        f"model = YOLO('{pt_path}'); "
                        f"model.export(format='onnx', imgsz=640, half=True)"
                    ],
                    check=True, capture_output=True, text=True,
                    timeout=ONNX_EXPORT_TIMEOUT
                )
            )

            # 重命名生成的 ONNX
            generated_onnx = pt_path.replace(".pt", ".onnx")
            if os.path.exists(generated_onnx):
                os.rename(generated_onnx, onnx_path)

            record.onnx_path = onnx_path
            await db.commit()

            # Step 2: .onnx → TensorRT .engine
            logger.info(f"Building TensorRT engine from {onnx_path}...")
            gpu_arch = get_gpu_architecture()
            logger.info(f"Detected GPU architecture: {gpu_arch}")

            await asyncio.to_thread(
                lambda: subprocess.run(
                    [
                        "trtexec",
                        f"--onnx={onnx_path}",
                        f"--saveEngine={engine_path}",
                        "--fp16",
                        "--workspace=1024",
                        "--optShapes=input:1x3x640x640",
                        "--best",
                    ],
                    check=True, capture_output=True, text=True,
                    timeout=TRT_BUILD_TIMEOUT
                )
            )

            record.engine_path = engine_path
            record.status = "ready"
            await db.commit()
            logger.info(f"Model {model_id} compiled successfully")

        except subprocess.CalledProcessError as e:
            record.status = "error"
            record.error_message = (e.stderr or "")[-1000:]
            await db.commit()
            logger.error(f"Compilation failed for model {model_id}: {e}")
        except Exception as e:
            record.status = "error"
            record.error_message = str(e)[-1000:]
            await db.commit()
            logger.error(f"Unexpected error compiling model {model_id}: {e}")

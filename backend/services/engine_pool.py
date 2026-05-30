try:
    import tensorrt as trt
    _HAS_TRT = True
except ImportError:
    _HAS_TRT = False
    trt = None
import numpy as np
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class TensorRTEngine:
    """单个 TensorRT 引擎的包装"""

    def __init__(self, engine_path: str, engine_id: str, model_name: str):
        self.engine_id = engine_id
        self.model_name = model_name
        self.engine_path = engine_path
        self.engine: Optional[trt.ICudaEngine] = None
        self.context: Optional[trt.IExecutionContext] = None
        self.streams_bound: set[int] = set()
        self.fps: float = 0.0
        self.gpu_memory_mb: float = 0.0

    def load(self):
        """从 .engine 文件加载"""
        if not _HAS_TRT:
            raise RuntimeError("TensorRT not available on this system")
        logger.info(f"Loading engine: {self.engine_path}")
        trt_logger = trt.Logger(trt.Logger.WARNING)
        with open(self.engine_path, "rb") as f:
            runtime = trt.Runtime(trt_logger)
            self.engine = runtime.deserialize_cuda_engine(f.read())

        self.context = self.engine.create_execution_context()

        # 估算显存用量
        self.gpu_memory_mb = sum(
            trt.volume(self.engine.get_binding_shape(i))
            for i in range(self.engine.num_bindings)
        ) * 4 / (1024 * 1024)  # fp32 bytes

        logger.info(f"Engine loaded: {self.engine_id}, ~{self.gpu_memory_mb:.0f}MB")

    def infer(self, input_tensor: np.ndarray) -> list[np.ndarray]:
        """同步推理"""
        if not _HAS_TRT:
            raise RuntimeError("TensorRT not available on this system")
        if not self.context:
            raise RuntimeError("Engine not loaded")

        import pycuda.driver as cuda
        import pycuda.autoinit

        # Allocate device memory
        d_input = cuda.mem_alloc(input_tensor.nbytes)
        d_outputs = []
        output_shapes = []

        for i in range(1, self.engine.num_bindings):
            shape = self.engine.get_binding_shape(i)
            size = trt.volume(shape)
            d_outputs.append(cuda.mem_alloc(size * 4))
            output_shapes.append(shape)

        # Copy input
        cuda.memcpy_htod(d_input, input_tensor.tobytes())

        # Execute
        bindings = [int(d_input)] + [int(d) for d in d_outputs]
        self.context.execute_v2(bindings)

        # Copy outputs
        results = []
        for d_out, shape in zip(d_outputs, output_shapes):
            size = trt.volume(shape)
            output = np.empty(size, dtype=np.float32)
            cuda.memcpy_dtoh(output, d_out)
            results.append(output.reshape(shape))

        return results

    def unload(self):
        """卸载引擎，释放显存"""
        self.context = None
        self.engine = None
        import gc
        gc.collect()
        import pycuda.driver as cuda
        cuda.Context.synchronize()
        logger.info(f"Engine unloaded: {self.engine_id}")


class EnginePool:
    """引擎池 — 管理多个 TensorRT 引擎"""

    def __init__(self):
        self._engines: dict[str, TensorRTEngine] = {}

    async def load_engine(self, engine_path: str, model_name: str) -> str:
        engine_id = f"engine_{model_name}_{os.path.basename(engine_path)}"
        if engine_id in self._engines:
            return engine_id

        engine = TensorRTEngine(engine_path, engine_id, model_name)
        await self._load_in_thread(engine)
        self._engines[engine_id] = engine
        return engine_id

    async def _load_in_thread(self, engine: TensorRTEngine):
        import asyncio
        await asyncio.to_thread(engine.load)

    def get_engine(self, engine_id: str) -> Optional[TensorRTEngine]:
        return self._engines.get(engine_id)

    async def unload_engine(self, engine_id: str):
        engine = self._engines.pop(engine_id, None)
        if engine:
            await self._unload_in_thread(engine)

    async def _unload_in_thread(self, engine: TensorRTEngine):
        import asyncio
        await asyncio.to_thread(engine.unload)

    def get_status(self) -> list[dict]:
        return [
            {
                "engine_id": eid,
                "model_name": eng.model_name,
                "gpu_memory_mb": round(eng.gpu_memory_mb, 1),
                "streams_bound": len(eng.streams_bound),
                "fps": round(eng.fps, 1),
                "status": "loaded" if eng.engine else "idle",
            }
            for eid, eng in self._engines.items()
        ]

    async def shutdown(self):
        for engine_id in list(self._engines.keys()):
            await self.unload_engine(engine_id)

    async def load_persisted_engines(self):
        """启动时自动加载已有的 .engine 文件"""
        from config import ENGINES_DIR
        if not ENGINES_DIR.exists():
            return
        for f in ENGINES_DIR.glob("*.engine"):
            model_name = f.stem
            try:
                await self.load_engine(str(f), model_name)
            except Exception as e:
                logger.warning(f"Failed to load engine {f}: {e}")


# 全局单例
engine_pool = EnginePool()

import cv2
import av
import asyncio
import logging
import time
import numpy as np
from typing import Optional
from config import RTSP_RECONNECT_MAX_RETRIES, RTSP_RECONNECT_DELAY_BASE

logger = logging.getLogger(__name__)


class StreamReader:
    """单路 RTSP 流读取器"""

    def __init__(self, stream_id: int, rtsp_url: str, fps_target: int = 15):
        self.stream_id = stream_id
        self.rtsp_url = rtsp_url
        self.fps_target = fps_target
        self.frame_interval = 1.0 / fps_target
        self._running = False
        self._container: Optional[av.container.InputContainer] = None
        self._latest_frame: Optional[np.ndarray] = None
        self._fps_actual: float = 0.0
        self._frame_count = 0
        self._last_time = time.time()

    async def start(self):
        """启动拉流"""
        self._running = True
        await self._connect()

    async def _connect(self):
        """连接 RTSP（带重试）"""
        for attempt in range(RTSP_RECONNECT_MAX_RETRIES):
            try:
                self._container = await asyncio.to_thread(
                    av.open, self.rtsp_url,
                    options={
                        "rtsp_transport": "tcp",
                        "stimeout": "5000000",
                        "max_delay": "1000000",
                        "buffer_size": "1024000",
                    }
                )
                logger.info(f"Stream {self.stream_id} connected: {self.rtsp_url}")
                return
            except Exception as e:
                delay = RTSP_RECONNECT_DELAY_BASE * (2 ** attempt)
                logger.warning(f"Stream {self.stream_id} connect failed "
                               f"(attempt {attempt+1}): {e}, retry in {delay}s")
                await asyncio.sleep(delay)

        logger.error(f"Stream {self.stream_id} failed after {RTSP_RECONNECT_MAX_RETRIES} attempts")

    async def read_loop(self):
        """持续读取帧"""
        while self._running:
            if not self._container:
                await asyncio.sleep(1)
                continue

            try:
                for packet in self._container.demux(video=0):
                    if not self._running:
                        break
                    for frame in packet.decode():
                        if not self._running:
                            break
                        img = frame.to_ndarray(format="bgr24")

                        # 缩放到 640x640
                        h, w = img.shape[:2]
                        scale = min(640 / w, 640 / h)
                        nw, nh = int(w * scale), int(h * scale)
                        resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)

                        # 填充到正方形
                        canvas = np.zeros((640, 640, 3), dtype=np.uint8)
                        x_off = (640 - nw) // 2
                        y_off = (640 - nh) // 2
                        canvas[y_off:y_off+nh, x_off:x_off+nw] = resized

                        self._latest_frame = canvas
                        self._frame_count += 1

                        # FPS 统计
                        now = time.time()
                        elapsed = now - self._last_time
                        if elapsed >= 1.0:
                            self._fps_actual = self._frame_count / elapsed
                            self._frame_count = 0
                            self._last_time = now

                        await asyncio.sleep(self.frame_interval)

            except Exception as e:
                logger.warning(f"Stream {self.stream_id} read error: {e}")
                await self._reconnect()

    async def _reconnect(self):
        """断线重连"""
        self._container = None
        await self._connect()

    def get_frame(self) -> Optional[np.ndarray]:
        return self._latest_frame

    def get_fps(self) -> float:
        return self._fps_actual

    async def stop(self):
        self._running = False
        if self._container:
            try:
                self._container.close()
            except Exception:
                pass


class StreamManager:
    """管理所有 RTSP 流"""

    def __init__(self):
        self._readers: dict[int, StreamReader] = {}
        self._tasks: dict[int, asyncio.Task] = {}

    async def add_stream(self, stream_id: int, rtsp_url: str, fps: int = 15):
        if stream_id in self._readers:
            await self.remove_stream(stream_id)
        reader = StreamReader(stream_id, rtsp_url, fps)
        self._readers[stream_id] = reader
        await reader.start()
        self._tasks[stream_id] = asyncio.create_task(reader.read_loop())

    async def remove_stream(self, stream_id: int):
        if stream_id in self._readers:
            await self._readers[stream_id].stop()
            if stream_id in self._tasks:
                self._tasks[stream_id].cancel()
                del self._tasks[stream_id]
            del self._readers[stream_id]

    def get_frame(self, stream_id: int) -> Optional[np.ndarray]:
        reader = self._readers.get(stream_id)
        return reader.get_frame() if reader else None

    def get_fps(self, stream_id: int) -> float:
        reader = self._readers.get(stream_id)
        return reader.get_fps() if reader else 0.0

    async def shutdown(self):
        for sid in list(self._readers.keys()):
            await self.remove_stream(sid)


stream_manager = StreamManager()

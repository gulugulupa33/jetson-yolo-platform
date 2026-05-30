import os
from pathlib import Path

# Docker内路径，本地开发用当前目录
ROOT = Path(os.path.dirname(os.path.abspath(__file__)))

MODELS_DIR = ROOT / "models"
ENGINES_DIR = ROOT / "engines"
CONFIG_DIR = ROOT / "config"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "jetson_yolo.db"

# 确保目录存在
for d in [MODELS_DIR, ENGINES_DIR, CONFIG_DIR, DATA_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# RTSP 配置
RTSP_RECONNECT_MAX_RETRIES = 5
RTSP_RECONNECT_DELAY_BASE = 2

# 流配置
STREAM_FPS_DEFAULT = 15
STREAM_FPS_MIN = 1
STREAM_FPS_MAX = 30

# WebSocket 帧推送间隔(秒)
WEBSOCKET_FRAME_INTERVAL = 0.1

# 编译超时(秒)
ONNX_EXPORT_TIMEOUT = 300
TRT_BUILD_TIMEOUT = 600

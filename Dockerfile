# =============================================================================
# Jetson YOLO Platform - Dockerfile (ARM64)
# 多阶段构建: base → backend → frontend → runtime
# =============================================================================

# ---- Stage 1: Base ----
FROM arm64v8/python:3.10-slim AS base

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    ffmpeg \
    nodejs \
    npm \
    curl \
    && rm -rf /var/lib/apt/lists/*

# CUDA + TensorRT（Jetson 上预装，这里留空留给目标平台的 TensorRT）
# 实际构建时取消注释对应平台的 TensorRT 安装
# RUN apt-get install -y --no-install-recommends tensorrt

WORKDIR /app

# ---- Stage 2: Backend ----
FROM base AS backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ /app/backend/
COPY backend/__init__.py /app/
COPY backend/config.py /app/backend/

# 确保目录存在
RUN mkdir -p /app/backend/models /app/backend/engines /app/backend/config /app/backend/data

# ---- Stage 3: Frontend ----
FROM node:20-slim AS frontend

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --only=production

COPY frontend/ ./
RUN npm run build

# ---- Stage 4: Runtime ----
FROM base AS runtime

# 安装 nginx
RUN apt-get update && apt-get install -y --no-install-recommends nginx && \
    rm -rf /var/lib/apt/lists/* && \
    rm /etc/nginx/sites-enabled/default

# 拷贝后端
COPY --from=backend /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=backend /app/backend /app/backend

# 拷贝前端构建产物
COPY --from=frontend /app/out /app/frontend/out

# Nginx 配置
COPY nginx.conf /etc/nginx/sites-enabled/jetson-yolo.conf

# 启动脚本
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 80
EXPOSE 8000

WORKDIR /app
ENTRYPOINT ["/app/entrypoint.sh"]

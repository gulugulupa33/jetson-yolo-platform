# =============================================================================
# Jetson YOLO Platform - Dockerfile (ARM64)
# 多阶段构建: base → backend-deps → frontend-build → runtime
# =============================================================================

# ---- Stage 1: Base ----
FROM arm64v8/python:3.10-slim AS base

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# 系统依赖（最小集）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0t64 \
    libgomp1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Stage 2: Backend deps ----
FROM base AS backend-deps

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/ /app/backend/

# 确保运行时目录存在
RUN mkdir -p /app/backend/models /app/backend/engines /app/backend/config /app/backend/data

# ---- Stage 3: Frontend build ----
FROM node:20-slim AS frontend-build

WORKDIR /app
COPY frontend/package*.json ./

# 安装 ALL deps（含 devDependencies，build 需要 TypeScript/Tailwind/PostCSS）
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---- Stage 4: Runtime ----
FROM arm64v8/python:3.10-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# 系统依赖（nginx + runtime libs）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0t64 \
    libgomp1 \
    ffmpeg \
    curl \
    nginx \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

# 拷贝 Python 依赖 + 后端代码
COPY --from=backend-deps /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=backend-deps /app/backend /app/backend
COPY --from=backend-deps /usr/local/bin/uvicorn /usr/local/bin/uvicorn

# 拷贝前端构建产物（静态导出 out/）
COPY --from=frontend-build /app/out /app/frontend/out

# Nginx 配置
COPY nginx.conf /etc/nginx/sites-enabled/jetson-yolo.conf

# 启动脚本
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 80
EXPOSE 8000

WORKDIR /app
ENTRYPOINT ["/app/entrypoint.sh"]

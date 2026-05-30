#!/bin/bash
set -e

echo "=== Jetson YOLO Platform Starting ==="

# 目录
mkdir -p /app/backend/models /app/backend/engines /app/backend/config /app/backend/data

# 启动后端
echo "Starting backend (FastAPI)..."
cd /app/backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# 启动 Nginx
echo "Starting nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# 优雅关闭
cleanup() {
    echo "Shutting down..."
    kill $BACKEND_PID 2>/dev/null
    kill $NGINX_PID 2>/dev/null
    wait
}

trap cleanup SIGTERM SIGINT

echo "=== Platform ready on port 80 ==="

# 等待任意一个进程退出
wait -n $BACKEND_PID $NGINX_PID

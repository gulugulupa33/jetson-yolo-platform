# Jetson YOLO 部署平台

在 Jetson Nano / DGX Spark 上快速部署 YOLO 模型的 Web 平台。

## 快速开始

```bash
# 1. 构建 Docker 镜像
docker compose build

# 2. 启动
docker compose up -d

# 3. 打开浏览器
# http://localhost:80
```

## 手动开发

```bash
# 后端
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 前端
cd frontend
npm install
npm run dev
```

## 功能

- 上传 .pt 权重，自动编译 TensorRT engine
- 添加 RTSP 视频流，绑定模型
- 三种部署模式：单引擎多流 / 多引擎多流 / 混合
- 实时检测结果预览（WebSocket）
- GPU/CPU/内存/温度监控

## 架构

```
Jetson YOLO Platform
├── backend/          FastAPI + TensorRT 推理服务
│   ├── routers/      REST API + WebSocket
│   ├── services/     引擎池、流管理、调度器
│   ├── models/       SQLAlchemy ORM
│   └── utils/        工具函数
├── frontend/         Next.js + Tailwind 前端
│   └── src/app/      页面组件
├── Dockerfile        多阶段构建
└── docker-compose.yml
```

# Jetson YOLO 部署平台 — 设计文档

> 创建日期: 2026-05-30
> 状态: 已批准

## 1. 项目概述

一个 Docker 一键部署的 YOLO 模型推理平台，专为 Jetson Nano / DGX Spark (ARM64 + NVIDIA GPU) 设计。用户上传 .pt 权重文件，系统自动编译 TensorRT engine，通过 Web 端配置 RTSP 视频流和部署模式，实时查看检测结果。

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker 容器（ARM64）                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  FastAPI 服务端                                               │
│  ├── REST API：模型上传/管理、部署配置、引擎管理                │
│  └── WebSocket：帧检测结果实时推送                              │
│                                                              │
│  推理引擎层                                                   │
│  ├── EnginePool：引擎池（管理 N 个 TensorRT engine）            │
│  ├── StreamManager：RTSP 拉流 + 预处理                         │
│  └── Dispatcher：按配置将流分发到引擎                            │
│                                                              │
│  存储层                                                       │
│  ├── SQLite：模型元数据、部署配置、运行日志                      │
│  ├── /models/：用户上传的 .pt / .onnx 文件                     │
│  ├── /engines/：编译好的 TensorRT .engine 文件                 │
│  └── /config/：部署模式 YAML 配置文件                           │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Next.js 前端（SSR, shadcn/ui）                                │
│  ├── 仪表盘：总览 + 实时预览网格                                │
│  ├── 模型管理：上传/列表/删除                                  │
│  ├── 部署配置：RTSP + 模型绑定 + 模式选择                       │
│  ├── 实时预览：Canvas 叠加检测框                                │
│  └── 系统监控：GPU/CPU/内存/FPS 曲线                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 3. 部署模式

### 模式 1: 单引擎多流
一个 TensorRT engine 处理多路 RTSP 流。适合同一模型跑多路，省显存。

### 模式 2: 多引擎多流
每路流绑独立的引擎。适合不同模型各跑各的，高性能。

### 模式 3: 混合模式（默认推荐）
引擎池 + Dispatcher 按 YAML 配置分配。灵活组合。

配置文件格式:
```yaml
stream_model_map:
  rtsp1: yolov8n     # 引擎 A 服务 1+2 路
  rtsp2: yolov8n
  rtsp3: yolov8s     # 引擎 B 服务第 3 路
  rtsp4: yolov5      # 引擎 C 服务 4+5 路
  rtsp5: yolov5
```

## 4. 后端设计

### 技术栈
- FastAPI (async) + uvicorn
- SQLite (SQLAlchemy + aiosqlite)
- TensorRT Python API
- av (PyAV/ffmpeg) 拉 RTSP
- WebSocket (FastAPI 原生)

### API 路由

```
POST   /api/models/upload       — 上传 .pt 文件
GET    /api/models              — 模型列表
DELETE /api/models/{id}         — 删除模型

POST   /api/engine/load/{model_id}   — 编译 + 加载引擎
POST   /api/engine/unload/{engine_id} — 卸载引擎
GET    /api/engine/status       — 所有引擎状态

POST   /api/streams             — 添加 RTSP 流
GET    /api/streams             — 流列表
DELETE /api/streams/{id}        — 删除流
PUT    /api/streams/{id}/bind   — 绑定流到引擎
PUT    /api/streams/{id}/config — 更新流配置

GET    /api/stats               — 系统监控数据

WS     /ws/video/{stream_id}    — 实时检测结果推送
```

### 推理 Pipeline

```
RTSP 输入 → av 解码 → GPU 预处理 (resize/normalize)
  → TensorRT execute_async → 后处理 (NMS)
  → WebSocket 推送 (检测框 + 可选帧 JPEG)
```

## 5. 前端设计

### 技术栈
- Next.js 14 (App Router)
- Tailwind CSS + shadcn/ui
- Recharts (图表)
- Canvas 2D (视频渲染)
- Zustand (状态管理)
- Lucide React (图标)

### 页面

| 页面 | 功能 |
|------|------|
| /dashboard | 总览卡片 + 实时预览网格 + 事件日志 |
| /models | 模型管理：上传、列表、状态、删除 |
| /deploy | 部署配置：RTSP 配置、模型绑定、模式选择 |
| /monitor | 系统监控：GPU/CPU/内存/温度/FPS 曲线 |
| /streams/{id} | 单路详情：放大预览 + 实时检测统计 |

### 视觉风格
- 深色主题
- 轻量动态背景效果
- 卡片式布局
- 实时数据动画过渡
- 明亮检测框 + 标签

## 6. Docker 构建

```
镜像基座: arm64v8/python:3.10-slim + NVIDIA TensorRT
分层:
  base:      CUDA + TensorRT + OpenCV
  inference: 推理引擎 + 模型编译工具
  backend:   FastAPI + 业务逻辑
  frontend:  Next.js 构建产物
  runtime:   Nginx 统一入口（反向代理后端 + 托管前端静态文件）
```

构建流程:
```dockerfile
FROM arm64v8/python:3.10-slim AS base
# 安装 CUDA + TensorRT + PyAV + ultralytics

FROM base AS builder
# 编译 TensorRT 工具

FROM builder AS final
# 拷贝 FastAPI 代码 + Next.js 构建产物
# Nginx 反向代理
# 入口脚本：初始化 → 启动后端 → 启动前端
```

## 7. 限制与注意事项

- Jetson Nano 4GB 单引擎多流模式最多 3-4 路 YOLOv8n，多引擎多流建议 2 路以内
- 首次加载模型需要编译 TensorRT engine，耗时 1-5 分钟（后端异步处理，UI 显示进度条）
- RTSP 断流自动重连（指数退避，最多 5 次）
- 所有推理数据本地存储，不上传外部

## 8. 未来可扩展方向

- WebRTC 低延迟推流
- 模型版本管理 + A/B 测试
- 检测结果录像回放
- MQTT 集成（对接 IoT 场景）
- 多节点集群管理

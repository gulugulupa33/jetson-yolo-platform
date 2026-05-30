#!/usr/bin/env python3
"""
Jetson YOLO Platform - 本地演示运行器
在 DGX Spark 上运行 YOLOv8n 推理，生成真实检测数据和标注帧
"""

import sys
import os
import json
import time
import sqlite3
import cv2
import numpy as np
from pathlib import Path
from datetime import datetime
from contextlib import closing

# GPU 加速
os.environ["CUDA_VISIBLE_DEVICES"] = "0"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# 项目路径（基于脚本位置自动计算）
PROJECT_DIR = Path(__file__).parent
MODEL_PATH = PROJECT_DIR / "backend/models/yolov8n.pt"
VIDEO_PATH = PROJECT_DIR / "backend/data/videos/traffic.mp4"
DB_PATH = PROJECT_DIR / "backend/data/jetson_yolo.db"
STATS_PATH = PROJECT_DIR / "backend/data/demo_stats.json"
FRAMES_DIR = PROJECT_DIR / "backend/data/frames"

# 确保目录存在
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

def seed_database():
    """初始化数据库：创建表并插入模型/流记录"""
    from ultralytics import YOLO
    import torch

    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()
    
    # 创建表（如果不存在）
    c.executescript("""
        CREATE TABLE IF NOT EXISTS models (
            id INTEGER PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            filename VARCHAR(256) NOT NULL,
            pt_path VARCHAR(512) NOT NULL,
            onnx_path VARCHAR(512),
            engine_path VARCHAR(512),
            status VARCHAR(32) DEFAULT 'uploaded',
            architecture VARCHAR(64),
            precision VARCHAR(16) DEFAULT 'fp16',
            gpu_memory_mb FLOAT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            error_message TEXT
        );
        CREATE TABLE IF NOT EXISTS streams (
            id INTEGER PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            rtsp_url VARCHAR(1024) NOT NULL,
            status VARCHAR(32) DEFAULT 'inactive',
            fps_target INTEGER DEFAULT 15,
            resolution VARCHAR(16) DEFAULT '640x640',
            bind_model_id INTEGER,
            deploy_mode VARCHAR(32) DEFAULT 'shared',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS deployment_configs (
            id INTEGER PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            stream_model_map TEXT,
            mode VARCHAR(32) DEFAULT 'hybrid',
            enabled BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # 检查是否已有模型
    existing = c.execute("SELECT id FROM models LIMIT 1").fetchone()
    if not existing:
        print("Seeding model record...")
        model = YOLO(str(MODEL_PATH))
        arch = str(model.model.model[0])[:50] if hasattr(model, 'model') else "yolov8n"
        c.execute(
            "INSERT INTO models (name, filename, pt_path, status, architecture, precision, gpu_memory_mb) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ["yolov8n", "yolov8n.pt", str(MODEL_PATH), "ready", "yolov8n", "fp32", 0]
        )
    else:
        # 更新状态为 ready
        c.execute("UPDATE models SET status='ready' WHERE status!='ready'")
    
    # 检查是否已有流
    existing = c.execute("SELECT id FROM streams LIMIT 1").fetchone()
    if not existing:
        print("Seeding stream record...")
        c.execute(
            "INSERT INTO streams (name, rtsp_url, status, fps_target, resolution, bind_model_id, deploy_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ["测试视频流", str(VIDEO_PATH), "inactive", 15, "640x480", 1, "shared", datetime.utcnow().isoformat()]
        )
    
    conn.commit()
    conn.close()
    print("Database seeded OK")

def run_inference():
    """运行 YOLO 推理，持续更新统计数据"""
    from ultralytics import YOLO
    
    print(f"Loading model: {MODEL_PATH}")
    model = YOLO(str(MODEL_PATH))
    
    print(f"Opening video: {VIDEO_PATH}")
    cap = cv2.VideoCapture(str(VIDEO_PATH))
    if not cap.isOpened():
        print("ERROR: Cannot open video file")
        return
    
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Video: {frame_w}x{frame_h}, {fps:.1f} fps, {total_frames} frames")
    
    frame_count = 0
    start_time = time.time()
    last_stats_update = 0
    
    # 创建帧输出目录
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    
    print("Starting inference loop...")
    while True:
        ret, frame = cap.read()
        if not ret:
            # 循环播放
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue
        
        frame_count += 1
        infer_start = time.time()
        
        # YOLO 推理（GPU 加速）
        results = model(frame, verbose=False, device="cuda:0")
        infer_time = time.time() - infer_start
        
        # 解析检测结果
        detections = []
        annotated_frame = None
        if results and len(results) > 0:
            # 获取标注后的帧（带检测框和标签）
            # plot() 返回 BGR numpy array（OpenCV 格式）
            annotated_frame = results[0].plot()
            
            boxes = results[0].boxes
            if boxes is not None and len(boxes) > 0:
                for i in range(len(boxes)):
                    xyxy = boxes.xyxy[i].tolist()
                    conf = float(boxes.conf[i])
                    cls_id = int(boxes.cls[i])
                    cls_name = model.names[cls_id] if hasattr(model, 'names') else str(cls_id)
                    detections.append({
                        "bbox": xyxy,
                        "class": cls_name,
                        "confidence": round(conf, 3),
                    })
        
        # 保存当前帧为 JPEG（供 MJPEG 流读取）
        try:
            if annotated_frame is not None:
                # 缩放到 960x720 保持清晰度
                h, w = annotated_frame.shape[:2]
                target_w, target_h = 960, 720
                if w > target_w or h > target_h:
                    scale = min(target_w / w, target_h / h)
                    new_w, new_h = int(w * scale), int(h * scale)
                    annotated_frame = cv2.resize(annotated_frame, (new_w, new_h))
                ret_jpg, jpg_buf = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                if ret_jpg:
                    (FRAMES_DIR / "stream_1.jpg").write_bytes(jpg_buf.tobytes())
        except Exception:
            pass
        
        # 每秒更新统计
        now = time.time()
        elapsed = now - start_time
        instant_fps = 1.0 / infer_time if infer_time > 0 else 0
        
        if now - last_stats_update >= 1.0:
            avg_fps = frame_count / elapsed if elapsed > 0 else 0
            stats = {
                "timestamp": now,
                "frame": frame_count,
                "fps": round(avg_fps, 1),
                "inference_ms": round(infer_time * 1000, 1),
                "detections": len(detections),
                "detection_list": detections[:10],  # 最多 10 个
                "video": {
                    "width": frame_w,
                    "height": frame_h,
                    "total_frames": total_frames,
                },
                "model": {
                    "name": "yolov8n",
                    "precision": "fp32",
                    "device": "GPU (CUDA Blackwell)",
                },
                # 系统资源（用于 stats API）
                "cpu_percent": 0,  # 会被系统 API 覆盖
                "memory_percent": 0,
                "gpu_util": 0,
                "gpu_memory_used_mb": 0,
                "gpu_memory_total_mb": 0,
                "gpu_temp": 0,
            }
            
            # 写入 JSON 文件供 stats API 读取
            with open(str(STATS_PATH), 'w') as f:
                json.dump(stats, f)
            
            # 更新数据库中的流状态
            try:
                conn = sqlite3.connect(str(DB_PATH))
                conn.execute(
                    "UPDATE streams SET status=?, last_active=? WHERE id=?",
                    ["running", datetime.utcnow().isoformat(), 1]
                )
                conn.commit()
                conn.close()
            except Exception:
                pass
            
            last_stats_update = now
            
            # 进度显示
            det_str = f"{len(detections)} detections" if detections else "no detections"
            print(f"\rFrame {frame_count} | {stats['fps']} fps | {stats['inference_ms']}ms | {det_str}", end="", flush=True)
        
        # 控制帧率（目标 15fps）
        frame_time = 1.0 / 15.0
        if infer_time < frame_time:
            time.sleep(frame_time - infer_time)

if __name__ == "__main__":
    seed_database()
    print("Starting demo inference...")
    try:
        run_inference()
    except KeyboardInterrupt:
        print("\nStopped by user")
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getWSClient } from "@/lib/websocket";
import {
  fetchModels,
  fetchStreams,
  type ModelInfo,
  type StreamInfo,
} from "@/lib/api";

// ============ 样式常量 ============
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

type GridLayout = "auto" | "1x1" | "2x2" | "3x3";

// ============ 主组件 ============
export default function DisplayPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [filterModel, setFilterModel] = useState<number | "all">("all");
  const [filterStream, setFilterStream] = useState<number | "all">("all");
  const [gridLayout, setGridLayout] = useState<GridLayout>("auto");
  const [wsConnected, setWsConnected] = useState(false);
  const [detections, setDetections] = useState<
    Record<number, { count: number; classes: Record<string, number>; fps: number }>
  >({});

  // 获取数据
  const fetchData = useCallback(async () => {
    try {
      const [modelsR, streamsR] = await Promise.all([
        fetchModels(),
        fetchStreams(),
      ]);
      setModels(modelsR);
      setStreams(streamsR);
    } catch {
      // 静默重试
    }
  }, []);

  // WebSocket 实时数据
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);

    const ws = getWSClient();
    ws.connect();

    const unsubStats = ws.on("stats", (data: unknown) => {
      const payload = data as {
        engines?: { total_fps?: number };
        demo?: { detections?: number };
      };
      setDetections((prev) => ({
        ...prev,
        1: {
          count: payload.demo?.detections ?? 0,
          classes: {},
          fps: payload.engines?.total_fps ?? 0,
        },
      }));
    });

    const unsubStatus = ws.on("_status", (data: unknown) => {
      setWsConnected((data as { status: string }).status === "connected");
    });

    return () => {
      clearInterval(interval);
      unsubStats();
      unsubStatus();
    };
  }, [fetchData]);

  // 计算可视流
  const visibleStreams = streams.filter((s) => {
    if (filterStream !== "all" && s.id !== filterStream) return false;
    if (filterModel !== "all" && s.bind_model_id !== filterModel) return false;
    return true;
  });

  // 计算网格列数
  const gridCols =
    gridLayout === "1x1" ? 1 : gridLayout === "2x2" ? 2 : gridLayout === "3x3" ? 3 : getAutoCols(visibleStreams.length);

  return (
    <div className="fixed inset-0 bg-[#050510] overflow-hidden">
      {/* === 顶部状态栏 === */}
      <div className="absolute top-0 left-0 right-0 z-50 h-14 bg-[#0a0a1a]/90 backdrop-blur-md border-b border-[#1a1a3e]/80 flex items-center px-5 gap-4">
        {/* Logo + 标题 */}
        <div className="flex items-center gap-2 mr-4">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">Y</span>
          </div>
          <span className="text-sm font-semibold text-white/80 tracking-wider">
            JETSON YOLO
          </span>
        </div>

        {/* 连接指示 */}
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              wsConnected ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]" : "bg-red-400"
            }`}
          />
          <span className={`${wsConnected ? "text-green-400" : "text-red-400"}`}>
            {wsConnected ? "实时连接" : "断开"}
          </span>
        </div>

        <div className="flex-1" />

        {/* 筛选控件 */}
        <FilterSelect
          label="模型"
          options={[
            { value: "all", label: "全部模型" },
            ...models.map((m) => ({ value: m.id, label: m.name })),
          ]}
          value={filterModel}
          onChange={setFilterModel}
        />
        <FilterSelect
          label="摄像头"
          options={[
            { value: "all", label: "全部摄像头" },
            ...streams.map((s) => ({ value: s.id, label: s.name })),
          ]}
          value={filterStream}
          onChange={setFilterStream}
        />

        {/* 布局切换 */}
        <div className="flex items-center gap-1 bg-[#0f0f2a]/80 rounded-lg p-0.5 border border-[#1a1a3e]">
          {(["auto", "1x1", "2x2", "3x3"] as GridLayout[]).map((layout) => (
            <button
              key={layout}
              onClick={() => setGridLayout(layout)}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-all ${
                gridLayout === layout
                  ? "bg-cyan-500/20 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.15)]"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {layout === "auto" ? "自适应" : layout.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* === 视频网格 === */}
      <div
        className="absolute inset-0 top-14 bottom-0 p-3 gap-3 grid"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${Math.ceil(visibleStreams.length / gridCols)}, 1fr)`,
        }}
      >
        {visibleStreams.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center text-gray-500">
            <div className="text-5xl mb-4 opacity-20">◈</div>
            <p className="text-sm">暂无匹配的视频流</p>
            <p className="text-xs mt-1">请调整筛选条件或添加视频源</p>
          </div>
        ) : (
          visibleStreams.map((stream) => (
            <StreamCard
              key={stream.id}
              stream={stream}
              mjpegUrl={`${API_BASE}/api/streams/${stream.id}/mjpeg`}
              detection={detections[stream.id]}
              running={stream.status === "running"}
            />
          ))
        )}
      </div>

      {/* === 底部状态栏 === */}
      <div className="absolute bottom-0 left-0 right-0 z-50 h-9 bg-[#0a0a1a]/80 backdrop-blur-md border-t border-[#1a1a3e]/60 flex items-center px-5 gap-4 text-[11px] text-gray-500">
        <span>实时推理监控 • {new Date().toLocaleTimeString("zh-CN")}</span>
        <span className="text-gray-600">|</span>
        <span>已连接 {visibleStreams.length} 路视频</span>
        <span className="text-gray-600">|</span>
        <span>
          总检测数:{" "}
          {Object.values(detections).reduce((s, d) => s + d.count, 0)}
        </span>
        <div className="flex-1" />
        <span className="text-gray-600">Jetson YOLO Platform v1.0</span>
      </div>
    </div>
  );
}

// ============ 流卡片组件 ============
function StreamCard({
  stream,
  mjpegUrl,
  detection,
  running,
}: {
  stream: StreamInfo;
  mjpegUrl: string;
  detection?: { count: number; classes: Record<string, number>; fps: number };
  running: boolean;
}) {
  const imgRef = useRef<HTMLImageElement>(null);

  return (
    <div className="relative overflow-hidden rounded-xl bg-[#08081a] border border-[#1a1a3e]/80 group hover:border-cyan-500/40 transition-all duration-300">
      {/* 发光边框动画 */}
      <div
        className={`absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-500 ${
          running
            ? "opacity-100"
            : "opacity-0"
        }`}
        style={{
          boxShadow: "inset 0 0 30px rgba(6, 182, 212, 0.05)",
        }}
      />

      {/* MJPEG 视频 */}
      <div className="w-full h-full flex items-center justify-center bg-[#050510]">
        {running ? (
          <img
            ref={imgRef}
            src={mjpegUrl}
            alt={stream.name}
            className="w-full h-full object-contain"
            style={{ imageRendering: "auto" }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-600">
            <div className="w-12 h-12 rounded-full border-2 border-gray-700 flex items-center justify-center mb-2">
              <span className="text-lg">◼</span>
            </div>
            <p className="text-xs">{stream.name}</p>
            <p className="text-[10px] mt-1">未运行</p>
          </div>
        )}
      </div>

      {/* === 信息覆盖层（左上） === */}
      <div className="absolute top-2 left-2 flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 border border-white/10">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              running
                ? "bg-green-400 animate-pulse shadow-[0_0_4px_rgba(74,222,128,0.6)]"
                : "bg-gray-600"
            }`}
          />
          <span className="text-[11px] font-medium text-white/80">
            {stream.name}
          </span>
        </div>
        {stream.bind_model_id && (
          <div className="bg-cyan-500/20 backdrop-blur-sm rounded-md px-2 py-1 border border-cyan-500/20">
            <span className="text-[10px] text-cyan-300 font-medium">
              YOLOv8n
            </span>
          </div>
        )}
      </div>

      {/* === 检测统计（右上） === */}
      {running && detection && (
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <div className="bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 border border-white/10">
            <span className="text-[11px] font-mono text-green-400">
              {detection.fps.toFixed(1)} FPS
            </span>
          </div>
          {detection.count > 0 && (
            <div className="bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 border border-white/10">
              <span className="text-[11px] font-mono text-yellow-400">
                {detection.count} 目标
              </span>
            </div>
          )}
        </div>
      )}

      {/* === 识别结果列表（右下） === */}
      {running && detection && detection.count > 0 && (
        <div className="absolute bottom-2 right-2 max-w-[50%]">
          <div className="bg-black/70 backdrop-blur-sm rounded-md px-2 py-1.5 border border-white/10 flex flex-wrap gap-1.5">
            {Object.entries(detection.classes)
              .slice(0, 5)
              .map(([cls, count]) => (
                <span
                  key={cls}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 font-mono"
                >
                  {cls}: {count}
                </span>
              ))}
            {Object.keys(detection.classes).length > 5 && (
              <span className="text-[10px] text-gray-500">
                +{Object.keys(detection.classes).length - 5}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ 筛选器组件 ============
function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: number | "all"; label: string }[];
  value: number | "all";
  onChange: (v: number | "all") => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-500 uppercase">{label}</span>
      <select
        value={value === "all" ? "all" : value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "all" ? "all" : Number(v));
        }}
        className="bg-[#0f0f2a]/80 border border-[#1a1a3e] rounded-md px-2 py-1 text-[11px] text-white/70 outline-none focus:border-cyan-500/40 cursor-pointer appearance-none min-w-[80px]"
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.value === "all" ? "all" : opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============ 工具函数 ============
function getAutoCols(count: number): number {
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  if (count <= 9) return 3;
  return 4;
}

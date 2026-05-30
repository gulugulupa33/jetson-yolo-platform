"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Activity,
  Box,
  Radio,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

type SystemStats = {
  cpu: { percent: number };
  memory: { total_gb: number; used_gb: number; percent: number };
  gpu: {
    gpu_util: number;
    memory_used_mb: number;
    memory_total_mb: number;
    temperature_c: number;
  };
  engines: { count: number; total_fps: number };
};

type StreamStatus = {
  id: number;
  name: string;
  status: string;
  fps_actual: number | null;
};

type ModelStatus = {
  id: number;
  name: string;
  status: string;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [streams, setStreams] = useState<StreamStatus[]>([]);
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const fetchData = useCallback(async () => {
    try {
      const [statsR, streamsR, modelsR] = await Promise.all([
        fetch(`${API_BASE}/api/stats`).then((r) => r.json()),
        fetch(`${API_BASE}/api/streams`).then((r) => r.json()),
        fetch(`${API_BASE}/api/models`).then((r) => r.json()),
      ]);
      setStats(statsR);
      setStreams(streamsR);
      setModels(modelsR);
    } catch {
      // 后端还没启动时静默失败
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // 模拟日志
  useEffect(() => {
    const demoLogs = [
      "[10:32:01] 系统启动完成",
      "[10:32:05] GPU 检测: NVIDIA Blackwell",
      "[10:32:10] 等待模型加载...",
    ];
    setLogs(demoLogs);
  }, []);

  const runningStreams = streams.filter((s) => s.status === "running").length;
  const readyModels = models.filter((m) => m.status === "ready").length;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 p-6 overflow-y-auto">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">仪表盘</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Jetson YOLO 部署平台运行总览
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={Box}
            label="已加载模型"
            value={readyModels.toString()}
            total={models.length.toString()}
            color="text-blue-400"
          />
          <StatCard
            icon={Radio}
            label="运行中流"
            value={`${runningStreams}/${streams.length}`}
            total="路"
            color="text-green-400"
          />
          <StatCard
            icon={Activity}
            label="推理总 FPS"
            value={stats?.engines.total_fps.toFixed(1) || "0"}
            total="fps"
            color="text-purple-400"
          />
          <StatCard
            icon={TrendingUp}
            label="GPU 利用率"
            value={`${stats?.gpu.gpu_util.toFixed(0) || "0"}%`}
            total={`${stats?.gpu.temperature_c.toFixed(0) || "0"}°C`}
            color="text-orange-400"
          />
        </div>

        {/* 实时预览网格 + 系统信息 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* 实时预览占位 */}
          <div className="col-span-2 bg-card rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold mb-3">实时预览</h2>
            <div className="grid grid-cols-2 gap-3">
              {streams.length === 0 ? (
                <div className="col-span-2 h-64 flex items-center justify-center text-muted-foreground text-sm">
                  暂无视频流，请先在"流配置"页面添加
                </div>
              ) : (
                streams.slice(0, 4).map((stream) => (
                  <div
                    key={stream.id}
                    className="relative aspect-video bg-black/50 rounded-lg border border-border overflow-hidden flex items-center justify-center"
                  >
                    <div className="text-center">
                      <Radio className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">{stream.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {stream.fps_actual?.toFixed(1) || "0"} fps
                      </p>
                    </div>
                    {/* 状态指示器 */}
                    <div className="absolute top-2 right-2">
                      {stream.status === "running" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 系统信息 */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold mb-3">系统状态</h2>
            <div className="space-y-4">
              <SysInfoRow
                label="CPU"
                value={`${stats?.cpu.percent.toFixed(0) || "0"}%`}
                percent={stats?.cpu.percent || 0}
              />
              <SysInfoRow
                label="内存"
                value={`${stats?.memory.used_gb.toFixed(1) || "0"}/${stats?.memory.total_gb.toFixed(1) || "0"} GB`}
                percent={stats?.memory.percent || 0}
              />
              <SysInfoRow
                label="GPU"
                value={`${stats?.gpu.gpu_util.toFixed(0) || "0"}%`}
                percent={stats?.gpu.gpu_util || 0}
              />
              <SysInfoRow
                label="显存"
                value={`${(stats?.gpu.memory_used_mb || 0).toFixed(0)}/${(stats?.gpu.memory_total_mb || 0).toFixed(0)} MB`}
                percent={
                  stats?.gpu.memory_total_mb
                    ? (stats.gpu.memory_used_mb / stats.gpu.memory_total_mb) * 100
                    : 0
                }
              />
              <SysInfoRow
                label="温度"
                value={`${stats?.gpu.temperature_c.toFixed(0) || "0"}°C`}
                percent={
                  stats?.gpu.temperature_c
                    ? (stats.gpu.temperature_c / 80) * 100
                    : 0
                }
                color="text-orange-400"
              />
            </div>
          </div>
        </div>

        {/* 事件日志 */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold mb-3">
            <AlertTriangle className="w-4 h-4 inline mr-2" />
            系统日志
          </h2>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {logs.map((log, i) => (
              <p key={i} className="text-xs text-muted-foreground font-mono">
                {log}
              </p>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  total,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  total: string;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{total}</div>
    </div>
  );
}

function SysInfoRow({
  label,
  value,
  percent,
  color = "text-foreground",
}: {
  label: string;
  value: string;
  percent: number;
  color?: string;
}) {
  const barColor =
    percent > 80
      ? "bg-red-500"
      : percent > 50
        ? "bg-yellow-500"
        : "bg-primary";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={color}>{value}</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { Activity, Cpu, Thermometer, Memory } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function MonitorPage() {
  const [gpuHistory, setGpuHistory] = useState<
    { time: string; gpu: number; temp: number; fps: number }[]
  >([]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/stats`);
      const data = await r.json();
      const now = new Date().toLocaleTimeString("zh-CN");
      setGpuHistory((prev) =>
        [...prev, { time: now, gpu: data.gpu.gpu_util, temp: data.gpu.temperature_c, fps: data.engines.total_fps }].slice(-30)
      );
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 p-6 overflow-y-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">系统监控</h1>
          <p className="text-sm text-muted-foreground mt-1">
            实时 GPU/CPU/内存/温度监控
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* GPU 利用率 */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              GPU 利用率
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={gpuHistory}>
                <defs>
                  <linearGradient id="gpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.7% 15.9%)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} unit="%" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(240 10% 5.9%)",
                    border: "1px solid hsl(240 3.7% 15.9%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="gpu"
                  stroke="#3b82f6"
                  fill="url(#gpuGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* FPS */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              推理 FPS
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={gpuHistory}>
                <defs>
                  <linearGradient id="fpsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.7% 15.9%)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} unit="fps" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(240 10% 5.9%)",
                    border: "1px solid hsl(240 3.7% 15.9%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="fps"
                  stroke="#a855f7"
                  fill="url(#fpsGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 温度 */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-orange-400" />
              GPU 温度
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={gpuHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.7% 15.9%)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} unit="°C" domain={[0, 80]} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(240 10% 5.9%)",
                    border: "1px solid hsl(240 3.7% 15.9%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="temp"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 内存 */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Memory className="w-4 h-4 text-green-400" />
              系统信息
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">CPU</p>
                <p className="text-lg font-bold text-foreground">
                  {gpuHistory.length > 0 ? `${gpuHistory[gpuHistory.length - 1].gpu}%` : "0%"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">状态</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-sm text-foreground">运行中</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">数据点</p>
                <p className="text-sm text-foreground">{gpuHistory.length} / 30</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

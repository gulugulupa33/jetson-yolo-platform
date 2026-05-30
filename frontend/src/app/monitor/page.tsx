"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import { getWSClient, type WSClient } from "@/lib/websocket";
import { fetchStats, fetchEngines, type SystemStats, type EngineInfo } from "@/lib/api";
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
import { Activity, Cpu, Thermometer, HardDrive, Wifi } from "lucide-react";

const MAX_POINTS = 30;

export default function MonitorPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [gpuHistory, setGpuHistory] = useState<
    { time: string; gpu: number; temp: number; fps: number }[]
  >([]);
  const [memHistory, setMemHistory] = useState<
    { time: string; mem: number; cpu: number }[]
  >([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WSClient | null>(null);

  const addDataPoint = useCallback((data: SystemStats) => {
    const now = new Date().toLocaleTimeString("zh-CN");
    setGpuHistory((prev) =>
      [
        ...prev,
        {
          time: now,
          gpu: data.gpu.gpu_util,
          temp: data.gpu.temperature_c,
          fps: data.engines.total_fps,
        },
      ].slice(-MAX_POINTS)
    );
    setMemHistory((prev) =>
      [
        ...prev,
        {
          time: now,
          mem: data.memory.percent,
          cpu: data.cpu.percent,
        },
      ].slice(-MAX_POINTS)
    );
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([fetchStats(), fetchEngines()]);
      setStats(s);
      setEngines(e);
      addDataPoint(s);
    } catch {
      // 后端未启动
    }
  }, [addDataPoint]);

  // REST polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // WebSocket stats updates
  useEffect(() => {
    const ws = getWSClient();
    wsRef.current = ws;
    ws.connect();

    const unsubStatus = ws.on("_status", (data: unknown) => {
      const s = data as { status: string };
      setWsConnected(s.status === "connected");
    });

    const unsubStats = ws.on("stats", (data: unknown) => {
      const s = data as SystemStats;
      setStats(s);
      addDataPoint(s);
    });

    setWsConnected(ws.getStatus() === "connected");

    return () => {
      unsubStatus();
      unsubStats();
    };
  }, [addDataPoint]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 p-6 overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">系统监控</h1>
            <p className="text-sm text-muted-foreground mt-1">
              实时 GPU/CPU/内存/温度监控
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Wifi
              className={`w-3.5 h-3.5 ${wsConnected ? "text-green-400" : "text-muted-foreground"}`}
            />
            <span className={wsConnected ? "text-green-400" : "text-muted-foreground"}>
              {wsConnected ? "WebSocket 已连接" : "WebSocket 未连接"}
            </span>
          </div>
        </div>

        {/* 实时数值 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <GaugeCard
            icon={Activity}
            label="GPU 利用率"
            value={stats?.gpu.gpu_util ?? 0}
            unit="%"
            threshold={80}
          />
          <GaugeCard
            icon={HardDrive}
            label="显存使用"
            value={
              stats
                ? (stats.gpu.memory_used_mb / stats.gpu.memory_total_mb) * 100
                : 0
            }
            unit="%"
            threshold={85}
          />
          <GaugeCard
            icon={Thermometer}
            label="GPU 温度"
            value={stats?.gpu.temperature_c ?? 0}
            unit="°C"
            threshold={70}
          />
          <GaugeCard
            icon={Cpu}
            label="CPU 利用率"
            value={stats?.cpu.percent ?? 0}
            unit="%"
            threshold={80}
          />
        </div>

        {/* 图表 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* GPU + FPS */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              GPU 利用率 & FPS
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={gpuHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.7% 15.9%)" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "hsl(240 5% 64.9%)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "hsl(240 5% 64.9%)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "hsl(240 5% 64.9%)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(240 10% 5.9%)",
                    border: "1px solid hsl(240 3.7% 15.9%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "hsl(0 0% 98%)" }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="gpu"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="GPU %"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="fps"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={false}
                  name="FPS"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="temp"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  dot={false}
                  name="温度 °C"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* CPU + 内存 */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              CPU & 内存
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={memHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.7% 15.9%)" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "hsl(240 5% 64.9%)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "hsl(240 5% 64.9%)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(240 10% 5.9%)",
                    border: "1px solid hsl(240 3.7% 15.9%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "hsl(0 0% 98%)" }}
                />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stroke="#22c55e"
                  fill="#22c55e22"
                  strokeWidth={2}
                  name="CPU %"
                />
                <Area
                  type="monotone"
                  dataKey="mem"
                  stroke="#eab308"
                  fill="#eab30822"
                  strokeWidth={2}
                  name="内存 %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 引擎状态 */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            推理引擎
          </h3>
          {engines.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              暂无运行中的引擎
            </p>
          ) : (
            <div className="space-y-2">
              {engines.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        e.status === "running" ? "bg-green-400" : "bg-yellow-400"
                      }`}
                    />
                    <span className="text-foreground">{e.model_name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>FPS: {e.fps.toFixed(1)}</span>
                    <span>流数: {e.stream_count}</span>
                    <span>{e.precision}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function GaugeCard({
  icon: Icon,
  label,
  value,
  unit,
  threshold,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  unit: string;
  threshold: number;
}) {
  const isWarning = value > threshold;
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon
          className={`w-4 h-4 ${isWarning ? "text-red-400" : "text-primary"}`}
        />
      </div>
      <p
        className={`text-2xl font-bold ${
          isWarning ? "text-red-400" : "text-foreground"
        }`}
      >
        {value.toFixed(1)}
        <span className="text-sm text-muted-foreground ml-1">{unit}</span>
      </p>
      <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isWarning ? "bg-red-500" : "bg-primary"
          }`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

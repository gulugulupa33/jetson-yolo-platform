"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import { getWSClient } from "@/lib/websocket";
import {
  fetchStats,
  fetchModels,
  fetchStreams,
  type SystemStats,
  type ModelInfo,
  type StreamInfo,
} from "@/lib/api";
import {
  Activity,
  Box,
  Radio,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";

export default function DashboardPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsR, streamsR, modelsR] = await Promise.all([
        fetchStats(),
        fetchStreams(),
        fetchModels(),
      ]);
      setStats(statsR);
      setStreams(streamsR);
      setModels(modelsR);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // WebSocket 实时日志
  useEffect(() => {
    const ws = getWSClient();
    ws.connect();

    const unsubLog = ws.on("log", (data: unknown) => {
      const msg = data as { message: string; level?: string };
      setLogs((prev) =>
        [`[${new Date().toLocaleTimeString("zh-CN")}] ${msg.message}`, ...prev].slice(0, 50)
      );
    });

    const unsubAll = ws.on("*", (data: unknown) => {
      const msg = data as { type: string; payload?: unknown };
      if (msg.type !== "log") {
        setLogs((prev) =>
          [`[${new Date().toLocaleTimeString("zh-CN")}] WS: ${msg.type}`, ...prev].slice(0, 50)
        );
        // 收到检测结果刷新数据
        fetchData();
      }
    });

    return () => {
      unsubLog();
      unsubAll();
    };
  }, [fetchData]);

  const activeStreams = streams.filter((s) => s.status === "running").length;
  const readyModels = models.filter((m) => m.status === "ready").length;
  const errorModels = models.filter((m) => m.status === "error").length;

  if (loading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 ml-60 p-6 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">加载中...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 p-6 overflow-y-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">仪表盘</h1>
          <p className="text-sm text-muted-foreground mt-1">
            系统概览 · 实时监控
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive-foreground text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
            <button onClick={fetchData} className="ml-auto text-xs underline">
              重试
            </button>
          </div>
        )}

        {/* 状态卡片 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatusCard
            icon={Activity}
            label="GPU 利用率"
            value={stats ? `${stats.gpu.gpu_util}%` : "--"}
            color="text-blue-400"
          />
          <StatusCard
            icon={Box}
            label="就绪模型"
            value={`${readyModels} / ${models.length}`}
            color={readyModels > 0 ? "text-green-400" : "text-yellow-400"}
          />
          <StatusCard
            icon={Radio}
            label="运行中流"
            value={`${activeStreams} / ${streams.length}`}
            color={activeStreams > 0 ? "text-green-400" : "text-muted-foreground"}
          />
          <StatusCard
            icon={TrendingUp}
            label="总 FPS"
            value={stats ? `${stats.engines.total_fps.toFixed(1)}` : "--"}
            color="text-purple-400"
          />
        </div>

        {/* 系统状态 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              系统资源
            </h3>
            <div className="space-y-3">
              <ProgressBar
                label="CPU"
                value={stats?.cpu.percent ?? 0}
                color="bg-blue-500"
              />
              <ProgressBar
                label="内存"
                value={stats?.memory.percent ?? 0}
                color="bg-green-500"
                detail={
                  stats
                    ? `${stats.memory.used_gb.toFixed(1)} / ${stats.memory.total_gb.toFixed(1)} GB`
                    : undefined
                }
              />
              <ProgressBar
                label="GPU 显存"
                value={
                  stats
                    ? (stats.gpu.memory_used_mb / stats.gpu.memory_total_mb) * 100
                    : 0
                }
                color="bg-purple-500"
                detail={
                  stats
                    ? `${(stats.gpu.memory_used_mb / 1024).toFixed(1)} / ${(stats.gpu.memory_total_mb / 1024).toFixed(1)} GB`
                    : undefined
                }
              />
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              模型状态
            </h3>
            {models.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                暂无模型，请上传 .pt 权重文件
              </p>
            ) : (
              <div className="space-y-2">
                {models.slice(0, 5).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-foreground truncate max-w-[180px]">
                      {m.name}
                    </span>
                    <span className="flex items-center gap-1 text-xs">
                      {m.status === "ready" ? (
                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                      ) : m.status === "compiling" ? (
                        <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
                      ) : m.status === "error" ? (
                        <XCircle className="w-3 h-3 text-red-400" />
                      ) : (
                        <Box className="w-3 h-3 text-yellow-400" />
                      )}
                      {m.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 流状态 */}
        <div className="bg-card rounded-xl border border-border p-4 mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            RTSP 流状态
          </h3>
          {streams.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              暂无配置流，请添加 RTSP 视频源
            </p>
          ) : (
            <div className="space-y-2">
              {streams.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        s.status === "running"
                          ? "bg-green-400"
                          : s.status === "error"
                            ? "bg-red-400"
                            : "bg-yellow-400"
                      }`}
                    />
                    <span className="text-foreground">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{s.rtsp_url.length > 30 ? s.rtsp_url.slice(0, 30) + "..." : s.rtsp_url}</span>
                    <span>FPS: {s.fps_actual?.toFixed(1) ?? "--"}</span>
                    <span>{s.deploy_mode}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 实时日志 */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            实时日志
          </h3>
          <div className="bg-black/50 rounded-lg p-3 h-32 overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                等待日志...
              </p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="text-green-400/80 leading-5">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  color,
  detail,
}: {
  label: string;
  value: number;
  color: string;
  detail?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
        <span>{detail ?? `${value.toFixed(1)}%`}</span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

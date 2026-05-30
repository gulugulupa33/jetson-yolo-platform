"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import {
  fetchStreams,
  fetchModels,
  createStream,
  deleteStream,
  startStream,
  stopStream,
  bindStreamToModel,
  type StreamInfo,
  type ModelInfo,
} from "@/lib/api";
import {
  Radio,
  Plus,
  Trash2,
  Play,
  Square,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

export default function StreamsPage() {
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    rtsp_url: "",
    fps_target: 15,
  });

  const fetchData = useCallback(async () => {
    try {
      const [sr, mr] = await Promise.all([
        fetchStreams(),
        fetchModels(),
      ]);
      setStreams(sr);
      setModels(mr.filter((m) => m.status === "ready"));
      setError(null);
    } catch {
      // 后端未启动
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAdd = async () => {
    if (!form.name || !form.rtsp_url) return;
    try {
      await createStream(form);
      setShowAdd(false);
      setForm({ name: "", rtsp_url: "", fps_target: 15 });
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加失败");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteStream(id);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleStart = async (id: number) => {
    try {
      await startStream(id);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "启动失败");
    }
  };

  const handleStop = async (id: number) => {
    try {
      await stopStream(id);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "停止失败");
    }
  };

  const handleBind = async (streamId: number, modelId: string) => {
    try {
      await bindStreamToModel(streamId, modelId ? Number(modelId) : null);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "绑定失败");
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 p-6 overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">流配置</h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理 RTSP 视频源 · 绑定推理模型
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchData}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加流
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-xs text-muted-foreground underline"
            >
              关闭
            </button>
          </div>
        )}

        {/* 添加流对话框 */}
        {showAdd && (
          <div className="mb-6 p-4 bg-card rounded-xl border border-border">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              新建 RTSP 流
            </h3>
            <div className="space-y-3">
              <input
                className="w-full p-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="名称 (如: 入口摄像头)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="w-full p-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground font-mono"
                placeholder="RTSP URL (如: rtsp://192.168.1.100:554/stream1)"
                value={form.rtsp_url}
                onChange={(e) =>
                  setForm({ ...form, rtsp_url: e.target.value })
                }
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">
                  目标 FPS:
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  className="w-20 p-2 rounded-lg bg-secondary border border-border text-sm text-foreground"
                  value={form.fps_target}
                  onChange={(e) =>
                    setForm({ ...form, fps_target: Number(e.target.value) })
                  }
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!form.name || !form.rtsp_url}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  确认添加
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 流列表 */}
        {streams.length === 0 && !showAdd ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Radio className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg mb-2">暂无流配置</p>
            <p className="text-sm">添加 RTSP 视频源开始推理</p>
          </div>
        ) : (
          <div className="space-y-3">
            {streams.map((s) => (
              <div
                key={s.id}
                className="bg-card rounded-xl border border-border p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        s.status === "running"
                          ? "bg-green-400 animate-pulse"
                          : s.status === "error"
                            ? "bg-red-400"
                            : "bg-yellow-400"
                      }`}
                    />
                    <h3 className="text-sm font-semibold text-foreground">
                      {s.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1">
                    {s.status !== "running" ? (
                      <button
                        onClick={() => handleStart(s.id)}
                        className="p-1.5 rounded-lg hover:bg-green-500/20 text-green-400 transition-colors"
                        title="启动"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStop(s.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                        title="停止"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-xs mb-3">
                  <div>
                    <span className="text-muted-foreground">RTSP</span>
                    <p className="text-foreground font-mono mt-0.5 truncate">
                      {s.rtsp_url}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">实际 FPS</span>
                    <p className="text-foreground mt-0.5">
                      {s.fps_actual?.toFixed(1) ?? "--"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">部署模式</span>
                    <p className="text-foreground mt-0.5">{s.deploy_mode}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">
                    绑定模型:
                  </label>
                  <select
                    value={s.bind_model_id ?? ""}
                    onChange={(e) => handleBind(s.id, e.target.value)}
                    className="p-1.5 rounded-lg bg-secondary border border-border text-xs text-foreground"
                  >
                    <option value="">不绑定</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

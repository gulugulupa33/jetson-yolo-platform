"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import { Radio, Plus, Trash2, CheckCircle2, XCircle } from "lucide-react";

type StreamInfo = {
  id: number;
  name: string;
  rtsp_url: string;
  status: string;
  fps_target: number;
  fps_actual: number | null;
  bind_model_id: number | null;
  deploy_mode: string;
};

type ModelInfo = {
  id: number;
  name: string;
  status: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function StreamsPage() {
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", rtsp_url: "", fps_target: 15 });

  const fetchData = useCallback(async () => {
    try {
      const [sr, mr] = await Promise.all([
        fetch(`${API_BASE}/api/streams`).then((r) => r.json()),
        fetch(`${API_BASE}/api/models`).then((r) => r.json()),
      ]);
      setStreams(sr);
      setModels(mr.filter((m: ModelInfo) => m.status === "ready"));
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAdd = async () => {
    try {
      await fetch(`${API_BASE}/api/streams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowAdd(false);
      setForm({ name: "", rtsp_url: "", fps_target: 15 });
      await fetchData();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API_BASE}/api/streams/${id}`, { method: "DELETE" });
      await fetchData();
    } catch {}
  };

  const handleBind = async (streamId: number, modelId: number) => {
    try {
      await fetch(`${API_BASE}/api/streams/${streamId}/bind`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId, deploy_mode: "shared" }),
      });
      await fetchData();
    } catch {}
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 p-6 overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">流配置</h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理 RTSP 视频源和模型绑定
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            添加流
          </button>
        </div>

        {/* 添加表单弹窗 */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-card rounded-xl border border-border p-6 w-96">
              <h2 className="text-lg font-semibold mb-4">添加 RTSP 流</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">名称</label>
                  <input
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例如：门口摄像头"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">RTSP 地址</label>
                  <input
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono"
                    value={form.rtsp_url}
                    onChange={(e) => setForm({ ...form, rtsp_url: e.target.value })}
                    placeholder="rtsp://192.168.1.100:554/stream1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">目标帧率</label>
                  <input
                    type="number"
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                    value={form.fps_target}
                    onChange={(e) => setForm({ ...form, fps_target: Number(e.target.value) })}
                    min={1}
                    max={30}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleAdd}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 流列表 */}
        <div className="space-y-3">
          {streams.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-12 text-center">
              <Radio className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">暂无视频流</h3>
              <p className="text-sm text-muted-foreground">
                点击"添加流"配置 RTSP 地址
              </p>
            </div>
          ) : (
            streams.map((stream) => (
              <div
                key={stream.id}
                className="bg-card rounded-xl border border-border p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {stream.status === "running" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {stream.name}
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono">
                        {stream.rtsp_url}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(stream.id)}
                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    实际帧率:{" "}
                    <span className="text-foreground">
                      {stream.fps_actual?.toFixed(1) || "-"} fps
                    </span>
                  </span>
                  <span>
                    目标帧率:{" "}
                    <span className="text-foreground">{stream.fps_target} fps</span>
                  </span>
                  <span>
                    部署模式:{" "}
                    <span className="text-foreground capitalize">
                      {stream.deploy_mode === "shared" ? "单引擎多流" : "多引擎多流"}
                    </span>
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">绑定模型:</span>
                  <select
                    className="bg-secondary border border-border rounded-lg px-2 py-1 text-xs text-foreground"
                    value={stream.bind_model_id ?? ""}
                    onChange={(e) =>
                      handleBind(stream.id, Number(e.target.value))
                    }
                  >
                    <option value="">未绑定</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

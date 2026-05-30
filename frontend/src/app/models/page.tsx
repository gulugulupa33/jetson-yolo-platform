"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import { Box, Upload, Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react";

type ModelInfo = {
  id: number;
  name: string;
  filename: string;
  architecture: string | null;
  status: string;
  precision: string;
  gpu_memory_mb: number;
  created_at: string;
  error_message: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  uploaded: { icon: Box, color: "text-yellow-400", label: "待编译" },
  compiling: { icon: Loader2, color: "text-blue-400", label: "编译中" },
  ready: { icon: CheckCircle2, color: "text-green-400", label: "就绪" },
  error: { icon: XCircle, color: "text-red-400", label: "错误" },
};

export default function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [uploading, setUploading] = useState(false);

  const fetchModels = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/models`);
      setModels(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchModels();
    const interval = setInterval(fetchModels, 2000);
    return () => clearInterval(interval);
  }, [fetchModels]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith(".pt")) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await fetch(`${API_BASE}/api/models/upload`, {
        method: "POST",
        body: formData,
      });
      await fetchModels();
    } catch {}
    setUploading(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API_BASE}/api/models/${id}`, { method: "DELETE" });
      await fetchModels();
    } catch {}
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 p-6 overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">模型管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              上传和管理 YOLO 权重文件（.pt）
            </p>
          </div>
          <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm">
            <Upload className="w-4 h-4" />
            {uploading ? "上传中..." : "上传 .pt"}
            <input
              type="file"
              accept=".pt"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </div>

        {models.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <Box className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">暂无模型</h3>
            <p className="text-sm text-muted-foreground mb-4">
              上传 YOLO .pt 权重文件开始部署
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {models.map((model) => {
              const StatusIcon = statusConfig[model.status]?.icon || Box;
              const statusColor = statusConfig[model.status]?.color || "text-gray-400";
              const statusLabel = statusConfig[model.status]?.label || model.status;

              return (
                <div
                  key={model.id}
                  className="bg-card rounded-xl border border-border p-4 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {model.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {model.filename}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(model.id)}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <StatusIcon
                      className={`w-4 h-4 ${statusColor} ${model.status === "compiling" ? "animate-spin" : ""}`}
                    />
                    <span className={`text-xs font-medium ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {model.architecture && (
                    <p className="text-xs text-muted-foreground mb-1">
                      架构: {model.architecture}
                    </p>
                  )}
                  {model.gpu_memory_mb > 0 && (
                    <p className="text-xs text-muted-foreground mb-1">
                      显存: ~{model.gpu_memory_mb.toFixed(0)} MB
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    上传于 {new Date(model.created_at).toLocaleString("zh-CN")}
                  </p>

                  {model.status === "error" && model.error_message && (
                    <p className="text-xs text-red-400 mt-2 line-clamp-2">
                      {model.error_message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

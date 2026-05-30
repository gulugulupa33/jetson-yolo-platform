"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import {
  fetchModels,
  uploadModel,
  deleteModel,
  type ModelInfo,
} from "@/lib/api";
import {
  Box,
  Upload,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

const statusConfig: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  uploaded: { icon: Box, color: "text-yellow-400", label: "待编译" },
  compiling: { icon: Loader2, color: "text-blue-400", label: "编译中" },
  ready: { icon: CheckCircle2, color: "text-green-400", label: "就绪" },
  error: { icon: XCircle, color: "text-red-400", label: "错误" },
};

export default function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    try {
      setModels(await fetchModels());
      setError(null);
    } catch {
      // 后端未启动时静默
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith(".pt")) {
      setError("请选择 .pt 权重文件");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadModel(file);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteModel(id);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 p-6 overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">模型管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              上传 .pt 权重 · 自动编译为 TensorRT 引擎
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
            <label className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              {uploading ? "上传中..." : "上传模型"}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pt"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
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

        {models.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Box className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg mb-2">暂无模型</p>
            <p className="text-sm">上传 .pt 权重文件开始使用</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((m) => {
              const cfg = statusConfig[m.status] || statusConfig.uploaded;
              const Icon = cfg.icon;
              return (
                <div
                  key={m.id}
                  className="bg-card rounded-xl border border-border p-4 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {m.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {m.filename}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <Icon
                        className={`w-3.5 h-3.5 ${cfg.color} ${m.status === "compiling" ? "animate-spin" : ""}`}
                      />
                      <span className={cfg.color}>{cfg.label}</span>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground mb-3">
                    {m.architecture && (
                      <div className="flex justify-between">
                        <span>架构</span>
                        <span>{m.architecture}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>精度</span>
                      <span>{m.precision}</span>
                    </div>
                    {m.gpu_memory_mb > 0 && (
                      <div className="flex justify-between">
                        <span>显存占用</span>
                        <span>{m.gpu_memory_mb} MB</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>创建时间</span>
                      <span>
                        {new Date(m.created_at).toLocaleString("zh-CN")}
                      </span>
                    </div>
                  </div>

                  {m.error_message && (
                    <div className="mb-3 p-2 rounded bg-destructive/10 text-xs text-red-400">
                      {m.error_message}
                    </div>
                  )}

                  <button
                    onClick={() => handleDelete(m.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    删除
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

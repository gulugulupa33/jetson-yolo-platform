"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { fetchDeployConfigs, type DeployConfig } from "@/lib/api";
import { Settings, RefreshCw } from "lucide-react";

const modeLabels: Record<string, string> = {
  single_engine_multi_stream: "单引擎多流（省显存）",
  multi_engine_multi_stream: "多引擎多流（高性能）",
  hybrid: "混合模式（推荐）",
};

export default function SettingsPage() {
  const [configs, setConfigs] = useState<DeployConfig[]>([]);

  useEffect(() => {
    fetchDeployConfigs()
      .then(setConfigs)
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 p-6 overflow-y-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">设置</h1>
          <p className="text-sm text-muted-foreground mt-1">
            系统配置 · 部署模式 · 管理
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* 部署模式说明 */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              部署模式
            </h3>
            <div className="space-y-3">
              {Object.entries(modeLabels).map(([key, label]) => (
                <div key={key} className="text-sm">
                  <p className="text-foreground font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {key === "single_engine_multi_stream" &&
                      "一个引擎服务多个流，共享显存，适合小模型多路并行"}
                    {key === "multi_engine_multi_stream" &&
                      "每个流独立引擎，独占显存，最高性能"}
                    {key === "hybrid" &&
                      "按 YAML 配置绑定，灵活组合，推荐默认使用"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 部署配置列表 */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              已保存部署配置
            </h3>
            {configs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                暂无部署配置
              </p>
            ) : (
              <div className="space-y-2">
                {configs.map((c) => (
                  <div key={c.id} className="text-sm py-2 border-b border-border last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-foreground">
                        {modeLabels[c.mode] || c.mode}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.updated_at).toLocaleString("zh-CN")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 环境信息 */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            环境信息
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">后端 API</span>
              <p className="text-foreground font-mono">
                {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">WebSocket</span>
              <p className="text-foreground font-mono">
                {process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">架构</span>
              <p className="text-foreground">ARM64 (Jetson)</p>
            </div>
            <div>
              <span className="text-muted-foreground">框架</span>
              <p className="text-foreground">FastAPI + Next.js + TensorRT</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

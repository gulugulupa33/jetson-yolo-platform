// API 客户端 — 统一管理后端 REST API 调用

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

// ========== 模型 API ==========

export type ModelInfo = {
  id: number;
  name: string;
  filename: string;
  architecture: string | null;
  status: "uploaded" | "compiling" | "ready" | "error";
  precision: string;
  gpu_memory_mb: number;
  created_at: string;
  error_message: string | null;
};

export function fetchModels(): Promise<ModelInfo[]> {
  return request("/api/models");
}

export function uploadModel(file: File): Promise<ModelInfo> {
  const formData = new FormData();
  formData.append("file", file);
  return fetch(`${API_BASE}/api/models/upload`, {
    method: "POST",
    body: formData,
  }).then((r) => {
    if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
    return r.json();
  });
}

export function deleteModel(id: number): Promise<void> {
  return request(`/api/models/${id}`, { method: "DELETE" });
}

export function compileModel(id: number): Promise<ModelInfo> {
  return request(`/api/models/${id}/compile`, { method: "POST" });
}

// ========== 流 API ==========

export type StreamInfo = {
  id: number;
  name: string;
  rtsp_url: string;
  status: string;
  fps_target: number;
  fps_actual: number | null;
  bind_model_id: number | null;
  deploy_mode: string;
};

export type StreamCreate = {
  name: string;
  rtsp_url: string;
  fps_target?: number;
};

export function fetchStreams(): Promise<StreamInfo[]> {
  return request("/api/streams");
}

export function createStream(data: StreamCreate): Promise<StreamInfo> {
  return request("/api/streams", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteStream(id: number): Promise<void> {
  return request(`/api/streams/${id}`, { method: "DELETE" });
}

export function startStream(id: number): Promise<StreamInfo> {
  return request(`/api/streams/${id}/start`, { method: "POST" });
}

export function stopStream(id: number): Promise<StreamInfo> {
  return request(`/api/streams/${id}/stop`, { method: "POST" });
}

export function bindStreamToModel(
  streamId: number,
  modelId: number | null
): Promise<StreamInfo> {
  return request(`/api/streams/${streamId}/bind`, {
    method: "POST",
    body: JSON.stringify({ model_id: modelId }),
  });
}

// ========== 引擎 API ==========

export type EngineInfo = {
  id: number;
  model_id: number;
  model_name: string;
  status: string;
  fps: number;
  stream_count: number;
  precision: string;
};

export function fetchEngines(): Promise<EngineInfo[]> {
  return request("/api/engines");
}

// ========== 统计 API ==========

export type SystemStats = {
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

export function fetchStats(): Promise<SystemStats> {
  return request("/api/stats");
}

// ========== 部署配置 API ==========

export type DeployConfig = {
  id: number;
  mode: string;
  stream_bindings: Record<string, Record<string, string>>;
  created_at: string;
  updated_at: string;
};

export function fetchDeployConfigs(): Promise<DeployConfig[]> {
  return request("/api/deploy/configs");
}

export function createDeployConfig(data: {
  mode: string;
  stream_bindings: Record<string, Record<string, string>>;
}): Promise<DeployConfig> {
  return request("/api/deploy/configs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function applyDeployConfig(id: number): Promise<void> {
  return request(`/api/deploy/configs/${id}/apply`, { method: "POST" });
}

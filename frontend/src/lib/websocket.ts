// WebSocket 连接管理器 — 统一管理实时推理结果推送

type MessageHandler = (data: unknown) => void;

type WSStatus = "disconnected" | "connecting" | "connected" | "error";

type WSOptions = {
  url?: string;
  reconnectInterval?: number;
  maxRetries?: number;
};

export class WSClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private status: WSStatus = "disconnected";
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private options: Required<WSOptions>;

  constructor(options?: WSOptions) {
    this.options = {
      url: options?.url || process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8100/ws",
      reconnectInterval: options?.reconnectInterval || 3000,
      maxRetries: options?.maxRetries || 10,
    };
  }

  /** 获取当前连接状态 */
  getStatus(): WSStatus {
    return this.status;
  }

  /** 连接 WebSocket */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.status = "connecting";
    this.ws = new WebSocket(this.options.url);

    this.ws.onopen = () => {
      this.status = "connected";
      this.retryCount = 0;
      this.emit("_status", { status: "connected" });
    };

    this.ws.onclose = () => {
      this.status = "disconnected";
      this.emit("_status", { status: "disconnected" });
      this.retry();
    };

    this.ws.onerror = () => {
      this.status = "error";
      this.emit("_status", { status: "error" });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { type, payload } = msg;
        this.emit(type, payload);
        this.emit("*", msg); // 通配符监听
      } catch {
        // 非 JSON 消息忽略
      }
    };
  }

  /** 断开连接 */
  disconnect(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryCount = this.options.maxRetries; // 阻止重连
    this.ws?.close();
    this.ws = null;
    this.status = "disconnected";
  }

  /** 订阅消息类型 */
  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // 返回取消订阅函数
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /** 发送消息 */
  send(type: string, payload?: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, payload }));
  }

  private emit(type: string, data: unknown): void {
    this.handlers.get(type)?.forEach((h) => h(data));
  }

  private retry(): void {
    if (this.retryCount >= this.options.maxRetries) return;
    this.retryCount++;
    this.retryTimer = setTimeout(() => this.connect(), this.options.reconnectInterval);
  }
}

// 单例
let _instance: WSClient | null = null;

export function getWSClient(): WSClient {
  if (!_instance) {
    _instance = new WSClient();
  }
  return _instance;
}

/**
 * 纯 Web 开发：Node HTTP(1122) ↔ 浏览器 SSE 桥接状态
 */

export type LegadoBridgeRequest = {
  id: string;
  path: string;
  method: string;
  body: string | null;
  query: Record<string, string>;
};

type PendingBridge = {
  req: LegadoBridgeRequest;
  resolve: (serialized: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingBridge>();
const sseClients = new Set<(data: string) => void>();

function pushRequest(req: LegadoBridgeRequest): void {
  const payload = JSON.stringify({ type: 'request', ...req });
  for (const send of sseClients) {
    send(payload);
  }
}

export function enqueueLegadoBridgeRequest(
  req: LegadoBridgeRequest,
  timeoutMs = 45_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(req.id);
      reject(new Error('browser bridge timeout'));
    }, timeoutMs);
    pending.set(req.id, { req, resolve, reject, timer });
    pushRequest(req);
  });
}

export function completeLegadoBridgeRequest(id: string, response: string): boolean {
  const item = pending.get(id);
  if (!item) return false;
  clearTimeout(item.timer);
  pending.delete(id);
  item.resolve(response);
  return true;
}

export function registerLegadoBridgeSseClient(send: (data: string) => void): () => void {
  sseClients.add(send);
  for (const item of pending.values()) {
    send(JSON.stringify({ type: 'request', ...item.req }));
  }
  return () => sseClients.delete(send);
}

export function hasLegadoBridgeClients(): boolean {
  return sseClients.size > 0;
}

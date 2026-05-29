/**
 * Legado App Web 服务书源调试（WebSocket bookSourceDebug）
 */

import { buildBookSourceDebugWebSocketUrl } from '@/lib/book-source/legado-web-endpoint';

let activeSocket: WebSocket | null = null;

export function cancelBookSourceDebugRemote(): void {
  if (activeSocket) {
    activeSocket.close();
    activeSocket = null;
  }
}

export function startBookSourceDebugRemote(
  wsEntry: string,
  sourceUrl: string,
  searchKey: string,
  onReceive: (text: string) => void,
  onFinish: () => void,
): void {
  cancelBookSourceDebugRemote();

  const tag = sourceUrl.trim();
  const key = searchKey.trim();
  if (!tag || !key) {
    onReceive('书源 URL 与调试关键词不能为空');
    onFinish();
    return;
  }

  const url = buildBookSourceDebugWebSocketUrl(wsEntry);
  const socket = new WebSocket(url);
  activeSocket = socket;

  socket.onopen = () => {
    socket.send(JSON.stringify({ tag, key }));
  };

  socket.onmessage = (event) => {
    onReceive(String(event.data ?? ''));
  };

  socket.onerror = () => {
    onReceive('WebSocket 连接失败，请确认 Legado 已开启 Web 服务且地址正确');
  };

  socket.onclose = () => {
    if (activeSocket === socket) activeSocket = null;
    onFinish();
  };
}

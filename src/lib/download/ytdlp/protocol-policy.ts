/**
 * Explicit unsupported protocol policy — fail fast before opaque engine errors.
 */

export interface UnsupportedProtocolEntry {
  protocol: string;
  reason: string;
  future?: string;
}

export const UNSUPPORTED_PROTOCOLS: UnsupportedProtocolEntry[] = [
  {
    protocol: 'rtmp',
    reason: 'Adobe RTMP 拉流未内置',
    future: '远期：ffmpeg -i rtmp:// 或专用 RTMP 客户端',
  },
  {
    protocol: 'rtmp_ffmpeg',
    reason: 'RTMP 需 ffmpeg 外部拉流',
    future: '远期：引擎侧 rtmp→file 管线',
  },
  {
    protocol: 'rtmpe',
    reason: '加密 RTMP (rtmpe) 未支持',
    future: '远期：与 RTMP 引擎一并实现',
  },
  {
    protocol: 'rtmpt',
    reason: 'RTMPT 隧道未支持',
    future: '远期：与 RTMP 引擎一并实现',
  },
  {
    protocol: 'websocket_frag',
    reason: 'websocket_frag 分片协议未移植',
    future: '远期：WebSocket 分片下载器',
  },
  {
    protocol: 'websocket',
    reason: 'WebSocket 媒体拉流未移植',
    future: '远期：WebSocket 下载器',
  },
];

const UNSUPPORTED_SET = new Map(
  UNSUPPORTED_PROTOCOLS.map((e) => [e.protocol.toLowerCase(), e]),
);

export function normalizeProtocol(protocol?: string, url?: string): string {
  const p = (protocol || '').toLowerCase().trim();
  if (p) return p;
  const u = (url || '').trim();
  if (/^rtmpe?:\/\//i.test(u)) return 'rtmp';
  if (/^rtmpt:\/\//i.test(u)) return 'rtmpt';
  if (/^ws:\/\//i.test(u) || /^wss:\/\//i.test(u)) return 'websocket';
  return '';
}

export function unsupportedProtocolMessage(protocol?: string, url?: string): string | null {
  const key = normalizeProtocol(protocol, url);
  if (!key) return null;
  const entry = UNSUPPORTED_SET.get(key);
  if (!entry) return null;
  const future = entry.future ? `（${entry.future}）` : '';
  return `[ytdlp] 协议 ${entry.protocol} 暂不支持：${entry.reason}${future}`;
}

export function isUnsupportedProtocol(protocol?: string, url?: string): boolean {
  return unsupportedProtocolMessage(protocol, url) !== null;
}

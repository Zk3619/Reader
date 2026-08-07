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
    future: '启用 allow_rtmp_ffmpeg 后可走 ffmpeg -i rtmp://；或改用 rtmp_ffmpeg format',
  },
  {
    protocol: 'rtmp_ffmpeg',
    reason: 'RTMP 需 ffmpeg 外部拉流（默认关闭）',
    future: '设置 allow_rtmp_ffmpeg / 配置 ytdlp.allowRtmpFfmpeg=true',
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

export interface ProtocolPolicyOptions {
  /** When true, rtmp_ffmpeg (and plain rtmp via ffmpeg) is allowed */
  allowRtmpFfmpeg?: boolean;
}

export function unsupportedProtocolMessage(
  protocol?: string,
  url?: string,
  opts?: ProtocolPolicyOptions,
): string | null {
  const key = normalizeProtocol(protocol, url);
  if (!key) return null;

  // Opt-in ffmpeg RTMP path
  if (opts?.allowRtmpFfmpeg && (key === 'rtmp_ffmpeg' || key === 'rtmp')) {
    return null;
  }

  const entry = UNSUPPORTED_SET.get(key);
  if (!entry) return null;
  const future = entry.future ? `（${entry.future}）` : '';
  return `[ytdlp] 协议 ${entry.protocol} 暂不支持：${entry.reason}${future}`;
}

export function isUnsupportedProtocol(
  protocol?: string,
  url?: string,
  opts?: ProtocolPolicyOptions,
): boolean {
  return unsupportedProtocolMessage(protocol, url, opts) !== null;
}

/** Protocols that should be fetched via ffmpeg -i when allowRtmpFfmpeg is on. */
export function isRtmpFfmpegProtocol(protocol?: string, url?: string): boolean {
  const key = normalizeProtocol(protocol, url);
  return key === 'rtmp_ffmpeg' || key === 'rtmp';
}

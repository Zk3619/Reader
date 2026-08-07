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
    future: '启用 allowRtmpFfmpeg 或 allowRtmpDump 后可用',
  },
  {
    protocol: 'rtmp_ffmpeg',
    reason: 'RTMP 需 ffmpeg 外部拉流（默认关闭）',
    future: '设置 allow_rtmp_ffmpeg / 配置 ytdlp.allowRtmpFfmpeg=true',
  },
  {
    protocol: 'rtmpe',
    reason: '加密 RTMP 需系统 rtmpdump',
    future: '设置 ytdlp.allowRtmpDump=true（PATH 含 rtmpdump）',
  },
  {
    protocol: 'rtmpt',
    reason: 'RTMPT 隧道需系统 rtmpdump',
    future: '设置 ytdlp.allowRtmpDump=true（PATH 含 rtmpdump）',
  },
];

const UNSUPPORTED_SET = new Map(
  UNSUPPORTED_PROTOCOLS.map((e) => [e.protocol.toLowerCase(), e]),
);

export function normalizeProtocol(protocol?: string, url?: string): string {
  const p = (protocol || '').toLowerCase().trim();
  if (p) return p;
  const u = (url || '').trim();
  if (/^rtmpe:\/\//i.test(u)) return 'rtmpe';
  if (/^rtmpt:\/\//i.test(u)) return 'rtmpt';
  if (/^rtmp:\/\//i.test(u)) return 'rtmp';
  if (/^ws:\/\//i.test(u) || /^wss:\/\//i.test(u)) return 'websocket_frag';
  return '';
}

export interface ProtocolPolicyOptions {
  /** When true, rtmp_ffmpeg (and plain rtmp via ffmpeg) is allowed */
  allowRtmpFfmpeg?: boolean;
  /** When true, rtmpe/rtmpt/rtmp via rtmpdump is allowed */
  allowRtmpDump?: boolean;
}

export function unsupportedProtocolMessage(
  protocol?: string,
  url?: string,
  opts?: ProtocolPolicyOptions,
): string | null {
  const key = normalizeProtocol(protocol, url);
  if (!key) return null;

  if (opts?.allowRtmpFfmpeg && (key === 'rtmp_ffmpeg' || key === 'rtmp')) {
    return null;
  }
  if (opts?.allowRtmpDump && (key === 'rtmpe' || key === 'rtmpt' || key === 'rtmp')) {
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

/** Protocols that should use rtmpdump when allowRtmpDump is on. */
export function isRtmpDumpProtocol(protocol?: string, url?: string): boolean {
  const key = normalizeProtocol(protocol, url);
  return key === 'rtmpe' || key === 'rtmpt' || key === 'rtmp';
}

/** WebSocket fragment media (TwitCasting llfmp4 etc.). */
export function isWebsocketFragProtocol(protocol?: string, url?: string): boolean {
  const key = normalizeProtocol(protocol, url);
  return key === 'websocket_frag' || key === 'websocket';
}

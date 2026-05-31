/**
 * DEV：封面加载链路追踪，用于在 DevTools 区分 remount 与缓存/刷新。
 *
 * 开启方式（二选一）：
 *   localStorage.setItem('reader:cover-trace', '1'); location.reload();
 *   window.__READER_COVER_TRACE__ = true;
 *
 * Console 过滤：`cover:trace`
 * 建议勾选 Preserve log，滚动书架后看统计：
 *   coverLoadTraceStats()
 */

export type CoverLoadTraceKind =
  /** BookCoverImg remount/effect 同步命中 L1，未进入 loadCoverImageObjectUrl */
  | 'remount-peek'
  /** BookCoverImg 调用 loadCoverImageObjectUrl（可能仍在内层命中缓存） */
  | 'remount-load'
  /** loadCover / peek 命中 L1 内存 */
  | 'memory-hit'
  /** L2 磁盘/IDB 命中 */
  | 'disk-hit'
  /** 磁盘未命中或 URL 不匹配 */
  | 'disk-miss'
  /** 合并进行中的同 key 加载 */
  | 'inflight-join'
  /** getBookInfo / 签名 URL 刷新 thumb */
  | 'url-refresh'
  /** 真实 HTTP 拉取封面二进制 */
  | 'network-fetch'
  /** 失败冷却命中，跳过加载 */
  | 'failure-cached'
  /** 虚拟列表快速滚动，推迟到停滚后再 load */
  | 'scroll-defer';

const STAT_KEY = '__readerCoverTraceStats';

type CoverTraceStats = Record<CoverLoadTraceKind, number>;

function emptyStats(): CoverTraceStats {
  return {
    'remount-peek': 0,
    'remount-load': 0,
    'memory-hit': 0,
    'disk-hit': 0,
    'disk-miss': 0,
    'inflight-join': 0,
    'url-refresh': 0,
    'network-fetch': 0,
    'failure-cached': 0,
    'scroll-defer': 0,
  };
}

export function isCoverLoadTraceEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    if (localStorage.getItem('reader:cover-trace') === '1') return true;
  } catch {
    /* ignore */
  }
  const g = globalThis as { __READER_COVER_TRACE__?: boolean };
  return g.__READER_COVER_TRACE__ === true;
}

export function setCoverLoadTraceEnabled(enabled: boolean): void {
  if (!import.meta.env.DEV) return;
  try {
    if (enabled) {
      localStorage.setItem('reader:cover-trace', '1');
    } else {
      localStorage.removeItem('reader:cover-trace');
    }
  } catch {
    /* ignore */
  }
  (globalThis as { __READER_COVER_TRACE__?: boolean }).__READER_COVER_TRACE__ =
    enabled;
}

function bumpStat(kind: CoverLoadTraceKind): void {
  const g = globalThis as { [STAT_KEY]?: CoverTraceStats };
  if (!g[STAT_KEY]) g[STAT_KEY] = emptyStats();
  g[STAT_KEY]![kind] += 1;
}

/** 滚动测试后于 Console 执行，查看各类型次数 */
export function coverLoadTraceStats(): CoverTraceStats {
  const g = globalThis as { [STAT_KEY]?: CoverTraceStats };
  return { ...(g[STAT_KEY] ?? emptyStats()) };
}

export function resetCoverLoadTraceStats(): void {
  const g = globalThis as { [STAT_KEY]?: CoverTraceStats };
  g[STAT_KEY] = emptyStats();
}

export type CoverLoadTraceDetail = {
  bookUrl?: string | null;
  coverUrl?: string;
  note?: string;
};

export function coverLoadTrace(
  kind: CoverLoadTraceKind,
  detail: CoverLoadTraceDetail = {},
): void {
  if (!isCoverLoadTraceEnabled()) return;
  bumpStat(kind);
  const book = detail.bookUrl?.trim();
  const file = detail.coverUrl?.split('/').pop()?.split('?')[0];
  console.log(`[cover:trace] ${kind}`, {
    kind,
    bookUrl: book || undefined,
    coverFile: file || undefined,
    network: kind === 'network-fetch' || kind === 'url-refresh',
    note: detail.note,
  });
}

if (import.meta.env.DEV) {
  const g = globalThis as {
    coverLoadTraceStats?: typeof coverLoadTraceStats;
    resetCoverLoadTraceStats?: typeof resetCoverLoadTraceStats;
    setCoverLoadTraceEnabled?: typeof setCoverLoadTraceEnabled;
  };
  g.coverLoadTraceStats = coverLoadTraceStats;
  g.resetCoverLoadTraceStats = resetCoverLoadTraceStats;
  g.setCoverLoadTraceEnabled = setCoverLoadTraceEnabled;
}

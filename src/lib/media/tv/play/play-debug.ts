/**
 * 播放地址调试：解析 proxy 嵌套 URL，控制台打印完整地址
 */

export function unwrapProxyMediaUrl(playUrl: string): {
  playUrl: string;
  upstream: string;
  referer?: string;
} {
  const play = playUrl.trim();
  try {
    const u = new URL(play);
    const nested = u.searchParams.get('url') ?? u.searchParams.get('target');
    if (nested) {
      return {
        playUrl: play,
        upstream: nested,
        referer: u.searchParams.get('Referer') ?? u.searchParams.get('referer') ?? undefined,
      };
    }
  } catch {
    /* */
  }
  return { playUrl: play, upstream: play };
}

export function logTvPlayRequest(
  label: string,
  playUrl: string,
  headers?: Record<string, string>,
): void {
  const info = unwrapProxyMediaUrl(playUrl);
  console.info(`[tv-play] ${label}`, {
    playUrl: info.playUrl,
    upstream: info.upstream,
    referer: info.referer ?? headers?.Referer ?? headers?.referer,
    headerKeys: headers ? Object.keys(headers) : [],
  });
}

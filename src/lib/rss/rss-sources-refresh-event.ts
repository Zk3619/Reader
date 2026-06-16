export const RSS_SOURCES_REFRESH_EVENT = 'rss-sources-refresh';

export type RssSourcesRefreshReason =
  | 'source-added'
  | 'source-removed'
  | 'source-updated'
  | 'source-reordered'
  | 'source-batch-updated'
  | 'unknown';

export interface RssSourcesRefreshDetail {
  reason?: RssSourcesRefreshReason;
  invalidateCache?: boolean;
}

export function dispatchRssSourcesRefresh(detail?: RssSourcesRefreshDetail): void {
  window.dispatchEvent(new CustomEvent<RssSourcesRefreshDetail>(RSS_SOURCES_REFRESH_EVENT, { detail }));
}

export function readRssSourcesRefreshDetail(
  event: Event,
): Required<Pick<RssSourcesRefreshDetail, 'reason' | 'invalidateCache'>> {
  const detail = (event as CustomEvent<RssSourcesRefreshDetail>).detail;
  return {
    reason: detail?.reason ?? 'unknown',
    invalidateCache: Boolean(detail?.invalidateCache),
  };
}

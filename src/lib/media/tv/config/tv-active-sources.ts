/**
 * 当前启用的影视 / 直播配置 URL（单一源库上的双选择，对齐 fongmi 可不同源）
 */

const STORAGE_KEY = 'tv_active_sources_v1';

export interface TvActiveSources {
  vodUrl: string;
  liveUrl: string;
}

function load(): TvActiveSources {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { vodUrl: '', liveUrl: '' };
    const parsed = JSON.parse(raw) as Partial<TvActiveSources>;
    return {
      vodUrl: typeof parsed.vodUrl === 'string' ? parsed.vodUrl : '',
      liveUrl: typeof parsed.liveUrl === 'string' ? parsed.liveUrl : '',
    };
  } catch {
    return { vodUrl: '', liveUrl: '' };
  }
}

function save(state: TvActiveSources): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* */
  }
}

let cached = load();

export function getTvActiveSources(): TvActiveSources {
  return cached;
}

export function setTvActiveVodUrl(url: string): void {
  cached = { ...cached, vodUrl: url };
  save(cached);
}

export function setTvActiveLiveUrl(url: string): void {
  cached = { ...cached, liveUrl: url };
  save(cached);
}

export function setTvActiveSources(patch: Partial<TvActiveSources>): void {
  cached = {
    vodUrl: patch.vodUrl ?? cached.vodUrl,
    liveUrl: patch.liveUrl ?? cached.liveUrl,
  };
  save(cached);
}

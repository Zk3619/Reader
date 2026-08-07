/**
 * Live smoke runner — used by vitest and port/run-live-smoke.mjs (via vitest export).
 *
 * xhamster / wsj require enhanced build (JA3); skipped automatically on lite profile.
 */
import { YoutubeDL } from './youtube-dl';
import { isTlsImpersonateBuild } from './networking/ja3-sites';

export type LiveSmokeResult = {
  site: string;
  url: string;
  ok: boolean;
  title?: string;
  formats?: number;
  entries?: number;
  error?: string;
  skipped?: boolean;
};

const SMOKE_CASES = [
  // —— P0 金样 ——
  {
    site: 'youtube',
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    ie_key: 'Youtube',
    opts: {},
    requiresEnhanced: false,
  },
  {
    site: 'youtube-tab',
    url: 'https://www.youtube.com/playlist?list=PLrAXtmRdnEQy6nuLMOV8u4Ex9VE8eaNY8',
    ie_key: 'YoutubeTab',
    opts: { extract_flat: true as const, playlist_items: '1:2' },
    requiresEnhanced: false,
  },
  {
    site: 'bilibili',
    url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
    ie_key: 'BiliBili',
    opts: {},
    requiresEnhanced: false,
  },
  {
    site: 'tiktok',
    url: 'https://www.tiktok.com/@scout2015/video/6718339393619004421',
    ie_key: 'TikTok',
    opts: {},
    requiresEnhanced: false,
  },
  {
    site: 'twitch-vod',
    url: 'https://www.twitch.tv/videos/1524811320',
    ie_key: 'TwitchVod',
    opts: {},
    requiresEnhanced: false,
  },
  // —— 既有站族 ——
  {
    site: 'xhamster',
    url: 'https://xhamster.com/videos/femaleagent-shy-beauty-takes-the-bait-1509445',
    ie_key: 'XHamster',
    opts: { impersonate: true as const },
    requiresEnhanced: true,
  },
  {
    site: 'wsj',
    url: 'https://www.wsj.com/video/series/a-brief-history-of-the-modern-cell-carrier-how-we-got-here/980E2187-401D-48A1-B82B-1486CEE06CB9',
    ie_key: 'WSJ',
    opts: { impersonate: true as const },
    requiresEnhanced: true,
  },
  {
    site: 'tube8',
    url: 'http://www.tube8.com/teen/kasia-music-video/229795/',
    ie_key: 'Tube8',
    opts: {},
    requiresEnhanced: false,
  },
  {
    site: 'zdf-channel',
    url: 'https://www.zdf.de/magazine/heute-journal-104',
    ie_key: 'ZDFChannel',
    opts: { extract_flat: true as const, playlist_items: '1:2' },
    requiresEnhanced: false,
  },
] as const;

export async function runLiveSmokeCases(): Promise<LiveSmokeResult[]> {
  const enhanced = isTlsImpersonateBuild();
  const results: LiveSmokeResult[] = [];
  for (const c of SMOKE_CASES) {
    if (c.requiresEnhanced && !enhanced) {
      results.push({
        site: c.site,
        url: c.url,
        ok: false,
        skipped: true,
        error: 'requires enhanced build (tls-impersonate / VITE_VIDEO_PROFILE=enhanced)',
      });
      continue;
    }
    const ydl = new YoutubeDL({
      ...c.opts,
      quiet: true,
      no_warnings: true,
    });
    try {
      const info = await ydl.extract_info(c.url, false, c.ie_key);
      results.push({
        site: c.site,
        url: c.url,
        ok: !!info,
        title: info?.title ?? undefined,
        formats: info?.formats?.length,
        entries: info?.entries?.length,
      });
    } catch (e) {
      results.push({
        site: c.site,
        url: c.url,
        ok: false,
        error: (e as Error).message,
      });
    }
  }
  return results;
}

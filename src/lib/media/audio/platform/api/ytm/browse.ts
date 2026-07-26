/**
 * YouTube Music 曲库 / Home 推荐歌单浏览
 */

import { innertubePost } from '@/lib/media/audio/platform/api/ytm/innertube';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId, formatDurationSec } from '@/lib/media/audio/track-types';

const LIBRARY_PLAYLISTS = 'FEmusic_liked_playlists';
const HOME_FEED = 'FEmusic_home';
const HOME_PLAYLIST_LIMIT = 30;

export interface YtmPlaylistSummary {
  id: string;
  browseId: string;
  name: string;
  coverUrl?: string;
  trackCount?: number;
  /** Home shelf 标题，作副标题兜底 */
  subtitle?: string;
}

function collectRenderers(node: unknown, key: string, out: unknown[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectRenderers(n, key, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj[key]) out.push(obj[key]);
  for (const v of Object.values(obj)) collectRenderers(v, key, out);
}

function runsText(runs?: Array<{ text?: string }> | null): string {
  return (runs ?? []).map((r) => r.text ?? '').join('');
}

function extractBrowseId(endpoint: unknown): string {
  if (!endpoint || typeof endpoint !== 'object') return '';
  const browse = (endpoint as { browseEndpoint?: { browseId?: string } }).browseEndpoint;
  return String(browse?.browseId ?? '').trim();
}

function extractPageType(endpoint: unknown): string {
  if (!endpoint || typeof endpoint !== 'object') return '';
  const browse = endpoint as {
    browseEndpoint?: {
      browseEndpointContextSupportedConfigs?: {
        browseEndpointContextMusicConfig?: { pageType?: string };
      };
    };
  };
  return String(
    browse.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType ?? '',
  );
}

function isMusicPlaylistBrowse(browseId: string, pageType: string): boolean {
  const normalized = pageType.toUpperCase();
  if (normalized.includes('PLAYLIST')) return true;
  if (normalized) return false;
  return browseId.startsWith('VL') || browseId.startsWith('PL');
}

function thumbUrlFromItem(item: Record<string, unknown>): string | undefined {
  const thumbs =
    (
      (item.thumbnailRenderer as Record<string, unknown> | undefined)
        ?.musicThumbnailRenderer as Record<string, unknown> | undefined
    )?.thumbnail as { thumbnails?: Array<{ url?: string }> } | undefined;
  const list = thumbs?.thumbnails;
  if (!list?.length) return undefined;
  return list[list.length - 1]?.url;
}

function parseTrackCountFromSubtitle(subtitle: string): number | undefined {
  const m = subtitle.match(/(\d[\d,]*)\s*(首|曲|songs?|tracks?)/i);
  if (!m?.[1]) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function parseTwoRowPlaylistItem(
  raw: unknown,
  shelfTitle?: string,
): YtmPlaylistSummary | null {
  const item = raw as Record<string, unknown>;
  const titleRuns =
    (item.title as { runs?: Array<{ text?: string; navigationEndpoint?: Record<string, unknown> }> } | undefined)
      ?.runs;
  const name = runsText(titleRuns);
  const nav =
    titleRuns?.[0]?.navigationEndpoint ??
    (item.navigationEndpoint as Record<string, unknown> | undefined);
  const browseId = extractBrowseId(nav);
  const pageType = extractPageType(nav);
  if (!browseId || !name || !isMusicPlaylistBrowse(browseId, pageType)) return null;
  const subtitleRuns =
    (item.subtitle as { runs?: Array<{ text?: string }> } | undefined)?.runs;
  const subtitle = runsText(subtitleRuns) || shelfTitle || '';
  return {
    id: browseId.replace(/^VL/, ''),
    browseId,
    name,
    coverUrl: thumbUrlFromItem(item),
    trackCount: parseTrackCountFromSubtitle(subtitle),
    subtitle: subtitle || undefined,
  };
}

function parseLibraryItem(raw: unknown): YtmPlaylistSummary | null {
  const item = raw as Record<string, unknown>;
  const titleRuns =
    (item.title as { runs?: Array<{ text?: string; navigationEndpoint?: Record<string, unknown> }> } | undefined)
      ?.runs ??
    (
      (
        (item.flexColumns as Array<Record<string, unknown>> | undefined)?.[0]
          ?.musicResponsiveListItemFlexColumnRenderer as Record<string, unknown>
      )?.text as { runs?: Array<{ text?: string; navigationEndpoint?: Record<string, unknown> }> }
    )?.runs;
  const name = runsText(titleRuns);
  const browseId = String(
    extractBrowseId(titleRuns?.[0]?.navigationEndpoint) ||
      extractBrowseId(item.navigationEndpoint) ||
      '',
  );
  if (!browseId || !name) return null;
  return {
    id: browseId.replace(/^VL/, ''),
    browseId,
    name,
    coverUrl: thumbUrlFromItem(item),
  };
}

export async function listYtmLibraryPlaylists(): Promise<YtmPlaylistSummary[]> {
  try {
    const body = await innertubePost<{ contents?: unknown }>('browse', {
      browseId: LIBRARY_PLAYLISTS,
    });
    const items: unknown[] = [];
    collectRenderers(body.contents, 'musicTwoRowItemRenderer', items);
    collectRenderers(body.contents, 'musicResponsiveListItemRenderer', items);
    const out: YtmPlaylistSummary[] = [];
    for (const raw of items) {
      const pl = parseLibraryItem(raw);
      if (pl) out.push(pl);
    }
    const seen = new Set<string>();
    return out.filter((p) => {
      if (seen.has(p.browseId)) return false;
      seen.add(p.browseId);
      return true;
    });
  } catch (err) {
    console.warn('[ytm] library playlists failed', err);
    return [];
  }
}

/**
 * 对齐 Neri `getHomePlaylistRecommendations`：browse FEmusic_home，抽出可播歌单卡
 */
export async function listYtmHomeRecommendPlaylists(
  limit = HOME_PLAYLIST_LIMIT,
): Promise<YtmPlaylistSummary[]> {
  try {
    const body = await innertubePost<{ contents?: unknown }>('browse', {
      browseId: HOME_FEED,
    });
    const carousels: unknown[] = [];
    collectRenderers(body.contents, 'musicCarouselShelfRenderer', carousels);

    const seen = new Set<string>();
    const out: YtmPlaylistSummary[] = [];

    for (const rawCarousel of carousels) {
      if (out.length >= limit) break;
      const carousel = rawCarousel as Record<string, unknown>;
      const shelfTitle = runsText(
        (
          (
            (carousel.header as Record<string, unknown> | undefined)
              ?.musicCarouselShelfBasicHeaderRenderer as Record<string, unknown> | undefined
          )?.title as { runs?: Array<{ text?: string }> } | undefined
        )?.runs,
      );
      const contents = (carousel.contents as unknown[]) ?? [];
      for (const content of contents) {
        if (out.length >= limit) break;
        const twoRow =
          content && typeof content === 'object'
            ? (content as Record<string, unknown>).musicTwoRowItemRenderer
            : undefined;
        if (!twoRow) continue;
        const pl = parseTwoRowPlaylistItem(twoRow, shelfTitle);
        if (!pl || seen.has(pl.browseId)) continue;
        seen.add(pl.browseId);
        out.push(pl);
      }
    }

    // 兜底：整页扫 musicTwoRowItemRenderer
    if (!out.length) {
      const items: unknown[] = [];
      collectRenderers(body.contents, 'musicTwoRowItemRenderer', items);
      for (const raw of items) {
        if (out.length >= limit) break;
        const pl = parseTwoRowPlaylistItem(raw);
        if (!pl || seen.has(pl.browseId)) continue;
        seen.add(pl.browseId);
        out.push(pl);
      }
    }

    return out;
  } catch (err) {
    console.warn('[ytm] home recommend playlists failed', err);
    return [];
  }
}

export async function getYtmPlaylistTracks(
  browseId: string,
  limit = 100,
): Promise<AudioTrack[]> {
  const id = browseId.startsWith('VL') ? browseId : `VL${browseId}`;
  try {
    const body = await innertubePost<{ contents?: unknown }>('browse', {
      browseId: id,
    });
    const items: unknown[] = [];
    collectRenderers(body.contents, 'musicResponsiveListItemRenderer', items);
    const tracks: AudioTrack[] = [];
    for (const raw of items) {
      if (tracks.length >= limit) break;
      const item = raw as Record<string, unknown>;
      const flex = (item.flexColumns as Array<Record<string, unknown>> | undefined) ?? [];
      const titleRuns =
        (
          (
            (flex[0]?.musicResponsiveListItemFlexColumnRenderer as Record<string, unknown>)
              ?.text as Record<string, unknown>
          )?.runs as Array<{ text?: string; navigationEndpoint?: Record<string, unknown> }>
        ) ?? [];
      const name = titleRuns.map((r) => r.text ?? '').join('');
      const videoId = String(
        (
          titleRuns[0]?.navigationEndpoint as
            | { watchEndpoint?: { videoId?: string } }
            | undefined
        )?.watchEndpoint?.videoId ??
          (item.playlistItemData as { videoId?: string } | undefined)?.videoId ??
          '',
      );
      if (!videoId) continue;
      const subRuns =
        (
          (
            (flex[1]?.musicResponsiveListItemFlexColumnRenderer as Record<string, unknown>)
              ?.text as Record<string, unknown>
          )?.runs as Array<{ text?: string }>
        ) ?? [];
      const artist = subRuns.map((r) => r.text ?? '').join('').split('•')[0]?.trim() ?? '';
      tracks.push({
        id: buildTrackId('ytm', videoId),
        name: name || videoId,
        artist,
        source: 'ytm',
        duration: formatDurationSec(0),
        meta: { videoId, songId: videoId },
      });
    }
    return tracks;
  } catch (err) {
    console.warn('[ytm] playlist tracks failed', err);
    return [];
  }
}

/**
 * TV2IE / TV2ArticleIE / KatsomoIE / MTVUutisetArticleIE — ported from yt-dlp tv2.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  js_to_json,
  remove_end,
  try_get,
} from '../../utils';
import { parseIso8601, strip_or_none } from './_helpers';

const PROTOCOLS = ['HLS', 'DASH'] as const;

async function extractPlaybackFormats(
  ie: InfoExtractor,
  videoId: string,
  fetchPlayback: (protocol: string) => Promise<Record<string, unknown>>,
  _isLive: boolean,
): Promise<Format[]> {
  const formats: Format[] = [];
  const formatUrls = new Set<string>();
  let lastData: Record<string, unknown> = {};

  for (const protocol of PROTOCOLS) {
    try {
      lastData = await fetchPlayback(protocol);
    } catch (e) {
      if (e instanceof ExtractorError) {
        const cause = (e as ExtractorError & { cause?: { status?: number; body?: string } }).cause;
        if (cause?.status === 401 && cause.body) {
          const error = ie._parse_json<{ error?: Record<string, unknown> }>(cause.body, videoId, null, false)?.error;
          const code = error?.code;
          if (code === 'ASSET_PLAYBACK_INVALID_GEO_LOCATION') {
            ie.raise_geo_restricted(undefined, ['NO']);
          }
          if (code === 'SESSION_NOT_AUTHENTICATED') {
            ie.raise_login_required();
          }
          throw new ExtractorError(String(error?.description || 'Playback error'), { expected: true });
        }
      }
      continue;
    }

    const streams = (lastData.streams as unknown[]) || (try_get(lastData, (x) => (x.items as Record<string, unknown>).item) as unknown[] | Record<string, unknown> | undefined);
    const items = Array.isArray(streams) ? streams : streams && typeof streams === 'object' ? [streams] : [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const videoUrl = rec.url != null ? String(rec.url) : '';
      if (!videoUrl || formatUrls.has(videoUrl)) continue;
      formatUrls.add(videoUrl);
      const formatId = `${protocol.toLowerCase()}-${rec.type ?? rec.mediaFormat ?? 'unknown'}`;
      const ext = determine_ext(videoUrl);
      if (ext === 'm3u8' && !lastData.drmProtected) {
        formats.push(
          ...(await ie._extract_m3u8_formats(
            videoUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            formatId,
            undefined,
            false,
          )),
        );
      } else if (ext === 'mpd') {
        formats.push(...(await ie._extract_mpd_formats(videoUrl, videoId, formatId, undefined, false)));
      } else if (!videoUrl.endsWith('.ism/Manifest')) {
        formats.push({
          url: videoUrl,
          format_id: formatId,
          tbr: int_or_none(rec.bitrate) ?? undefined,
          filesize: int_or_none(rec.fileSize) ?? undefined,
        });
      }
    }
  }

  if (!formats.length && lastData.drmProtected) {
    ie.report_drm?.(videoId);
  }
  return formats;
}

export class TV2IE extends InfoExtractor {
  static _VALID_URL = /https?:\/\/(?:www\.)?tv2\.no\/v(?:ideo)?\d*(?:\/[^?#]+\/)*(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const asset = await this._download_json<Record<string, unknown>>(
      `https://sumo.tv2.no/rest/assets/${videoId}`,
      videoId,
    );
    const isLive = asset.live === true;
    const formats = await extractPlaybackFormats(
      this,
      videoId,
      (protocol) =>
        this._download_json<Record<string, unknown>>(
          `https://api.sumo.tv2.no/play/${videoId}?stream=${protocol}`,
          videoId,
          undefined,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            data: JSON.stringify({ device: { id: '1-1-1', name: 'Nettleser (HTML)' } }),
          },
        ).then((r) => r.playback as Record<string, unknown>),
      isLive,
    );

    const thumbnails: Thumbnail[] = Object.entries((asset.images as Record<string, string>) || {}).map(
      ([id, thumbUrl]) => ({ id, url: thumbUrl }),
    );

    return {
      id: videoId,
      title: String(asset.title || videoId),
      description: strip_or_none(asset.description) || undefined,
      thumbnails,
      timestamp: parseIso8601(asset.live_broadcast_time) ?? parseIso8601(asset.update_time) ?? undefined,
      duration: float_or_none(asset.accurateDuration) ?? float_or_none(asset.duration) ?? undefined,
      view_count: int_or_none(asset.views) ?? undefined,
      categories: asset.tags != null ? String(asset.tags).split(',') : undefined,
      formats,
      is_live: isLive,
    };
  }
}

export class TV2ArticleIE extends InfoExtractor {
  static _VALID_URL = /https?:\/\/(?:www\.)?tv2\.no\/(?!v(?:ideo)?\d*(?:\/|$))[^?#]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const assets: string[] = [...webpage.matchAll(/data-assetid=["'](\d+)/g)].map((m) => m[1]!);
    if (!assets.length) {
      for (const v of webpage.matchAll(/(?:TV2ContentboxVideo|TV2\.TV2Video)\(({.+?})\)/g)) {
        const video = this._parse_json<Record<string, unknown>>(v[1]!, playlistId, js_to_json, false);
        const assetId = video?.assetId;
        if (assetId != null) assets.push(String(assetId));
      }
    }
    const entries = assets.map((assetId) => this.url_result(`http://www.tv2.no/v/${assetId}`, 'TV2', assetId));
    return this.playlist_result(
      entries,
      playlistId,
      remove_end(this._og_search_title(webpage, false) || '', ' - TV2.no') || undefined,
      remove_end(this._og_search_description(webpage) || '', ' - TV2.no') || undefined,
    );
  }
}

export class KatsomoIE extends InfoExtractor {
  static IE_NAME = 'katsomo';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:katsomo|mtv(?:uutiset)?)\.fi\/(?:sarja\/[0-9a-z-]+-\d+\/[0-9a-z-]+-|(?:#!\/)?jakso\/(?:\d+\/[^/]+\/)?|video\/prog)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const apiBase = `http://api.katsomo.fi/api/web/asset/${videoId}`;
    const asset = (await this._download_json<{ asset: Record<string, unknown> }>(`${apiBase}.json`, videoId)).asset;
    const isLive = asset.live === true;
    const formats = await extractPlaybackFormats(
      this,
      videoId,
      (protocol) =>
        this._download_json<{ playback: Record<string, unknown> }>(
          `${apiBase}/play.json?protocol=${protocol}&videoFormat=SMIL+ISMUSP`,
          videoId,
        ).then((r) => r.playback),
      isLive,
    );

    const thumbnails: Thumbnail[] = Object.entries((asset.imageVersions as Record<string, Record<string, unknown>>) || {}).map(
      ([, thumb]) => ({
        id: thumb['@type'] != null ? String(thumb['@type']) : undefined,
        url: String(thumb.url || ''),
      }),
    );

    return {
      id: videoId,
      title: String(asset.subtitle || asset.title || videoId),
      description: strip_or_none(asset.description) || undefined,
      thumbnails,
      timestamp: parseIso8601(asset.createTime) ?? undefined,
      duration: float_or_none(asset.accurateDuration) ?? float_or_none(asset.duration) ?? undefined,
      view_count: int_or_none(asset.views) ?? undefined,
      categories: asset.keywords != null ? String(asset.keywords).split(',') : undefined,
      formats,
      is_live: isLive,
    };
  }
}

export class MTVUutisetArticleIE extends InfoExtractor {
  static _VALID_URL = /https?:\/\/(?:www\.)mtvuutiset\.fi\/artikkeli\/[^/]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const article = await this._download_json<Record<string, unknown>>(
      `http://api.mtvuutiset.fi/mtvuutiset/api/json/${articleId}`,
      articleId,
    );
    const entries: VideoInfo[] = [];
    for (const video of (article.videos as Record<string, unknown>[]) || []) {
      const videoType = video.videotype != null ? String(video.videotype) : '';
      const videoUrl = video.url != null ? String(video.url) : '';
      if (!videoUrl || !['katsomo', 'youtube'].includes(videoType)) continue;
      const ieKey = videoType === 'youtube' ? 'Youtube' : 'Katsomo';
      entries.push(this.url_result(videoUrl, ieKey, video.video_id != null ? String(video.video_id) : undefined));
    }
    return this.playlist_result(
      entries,
      articleId,
      article.title != null ? String(article.title) : undefined,
      article.description != null ? String(article.description) : undefined,
    );
  }
}

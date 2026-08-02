/**
 * CondeNastIE — ported from yt-dlp condenast.py
 * Pragmatic main path: embed-api.json lookup + inline/config.js fallback.
 * Login-gated / obsolete `loader.js` fallback paths are omitted.
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  extract_attributes,
  int_or_none,
  js_to_json,
  mimetype2ext,
  str_or_none,
} from '../../utils';
import { orderedSet, parseIso8601, urljoin } from './_helpers';

const SITES = [
  'allure',
  'architecturaldigest',
  'arstechnica',
  'bonappetit',
  'brides',
  'cnevids',
  'cntraveler',
  'details',
  'epicurious',
  'glamour',
  'golfdigest',
  'gq',
  'newyorker',
  'self',
  'teenvogue',
  'vanityfair',
  'vogue',
  'wired',
  'wmagazine',
];
const SITES_RE = SITES.join('|');

type VideoParams = { videoId: string; playerId?: string; target?: string };

export class CondeNastIE extends InfoExtractor {
  static IE_NAME = 'CondeNast';
  static _VALID_URL = new RegExp(
    `https?://(?:video|www|player(?:-backend)?)\\.(?:${SITES_RE})\\.com/` +
      '(?:' +
      '(?:embed(?:js)?|(?:script|inline)/video)/(?<id>[0-9a-f]{24})(?:/(?<player_id>[0-9a-f]{24}))?(?:.+?\\btarget=(?<target>[^&]+))?|' +
      '(?<type>watch|series|video)/(?<display_id>[^/?#]+)' +
      ')',
  );

  private _extractSeries(url: string, webpage: string): VideoInfo {
    const title = this._html_search_regex(
      /<div class="cne-series-info">[\s\S]*?<h1>(.+?)<\/h1>/,
      webpage,
      'series title',
    )!;
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    const paths = orderedSet(
      [...webpage.matchAll(/<p class="cne-thumb-title">[\s\S]*?<a href="(\/watch\/.+?)["?]/g)].map((m) => m[1]!),
    );
    const entries = paths.map((p) => this.url_result(urljoin(baseUrl, p), 'CondeNast'));
    return this.playlist_result(entries, undefined, title);
  }

  private _extractVideoParams(webpage: string, displayId: string): VideoParams | null {
    const raw = this._search_regex(/var\s+params\s*=\s*({.+?})[;,]/, webpage, 'player params', '{}', false);
    const query = this._parse_json<Record<string, unknown>>(raw ? js_to_json(raw) : '{}', displayId, null, false);
    if (query && Object.keys(query).length) {
      const videoId = this._search_regex(
        /(?:data-video-id=|currentVideoId\s*=\s*)["']([\da-f]+)/,
        webpage,
        'video id',
        null,
        false,
      );
      return { videoId: videoId || '', playerId: str_or_none(query.playerId) ?? undefined, target: str_or_none(query.target) ?? undefined };
    }
    const playerEl = this._search_regex(/(<[^>]+data-js="video-player"[^>]+>)/, webpage, 'player params element', null, false);
    if (!playerEl) return null;
    const attrs = extract_attributes(playerEl);
    return { videoId: attrs['data-video'] || '', playerId: attrs['data-player'], target: attrs.id };
  }

  private async _extractVideo(params: VideoParams): Promise<VideoInfo> {
    const videoId = params.videoId;

    let videoInfo: Record<string, unknown> | null = null;
    const infoPage = await this._download_json<{ video?: Record<string, unknown> }>(
      'http://player.cnevids.com/embed-api.json',
      videoId,
      'Downloading embed info',
      {
        fatal: false,
        query: {
          videoId: params.videoId,
          ...(params.playerId ? { playerId: params.playerId } : {}),
          ...(params.target ? { target: params.target } : {}),
          embedType: 'inline',
        },
      },
    );
    videoInfo = infoPage?.video ?? null;

    if (!videoInfo) {
      const inlinePage = await this._download_webpage(
        `https://player.cnevids.com/inline/video/${videoId}.js`,
        videoId,
        'Downloading inline info',
        { query: { target: params.target || 'embedplayer' }, fatal: false },
      );
      if (inlinePage) {
        const configRaw = this._search_regex(/var\s+config\s*=\s*({.+?});/, inlinePage, 'config', null, false);
        if (configRaw) {
          const config = this._parse_json<{ video?: Record<string, unknown> }>(js_to_json(configRaw), videoId, null, false);
          videoInfo = config?.video ?? null;
        }
      }
    }

    if (!videoInfo) {
      throw new ExtractorError(`Unable to extract CondeNast video info for ${videoId}`, { expected: true });
    }

    const title = str_or_none(videoInfo.title) || videoId;

    const formats: Format[] = [];
    const sources = Array.isArray(videoInfo.sources) ? (videoInfo.sources as Record<string, unknown>[]) : [];
    for (const fdata of sources) {
      const src = str_or_none(fdata.src);
      if (!src) continue;
      const ext = mimetype2ext(str_or_none(fdata.type)) || determine_ext(src);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(src, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
        continue;
      }
      const quality = fdata.quality;
      formats.push({
        format_id: `${ext}${quality ? `-${quality}` : ''}`,
        url: src,
        ext,
        quality: quality === 'high' ? 1 : 0,
      });
    }

    const subtitles: Record<string, Array<{ ext: string; url: string }>> = {};
    const captions = (videoInfo.captions as Record<string, Record<string, unknown>>) || {};
    for (const [t, caption] of Object.entries(captions)) {
      const capUrl = str_or_none(caption?.src);
      if (!capUrl || !['vtt', 'srt', 'tml'].includes(t)) continue;
      (subtitles.en ||= []).push({ url: capUrl, ext: 'vtt' });
    }

    return {
      id: videoId,
      formats,
      title,
      thumbnail: str_or_none(videoInfo.poster_frame) ?? undefined,
      uploader: str_or_none(videoInfo.brand) ?? undefined,
      duration: int_or_none(videoInfo.duration) ?? undefined,
      tags: (videoInfo.tags as string[]) ?? undefined,
      series: str_or_none(videoInfo.series_title) ?? undefined,
      season: str_or_none(videoInfo.season_title) ?? undefined,
      timestamp: parseIso8601(videoInfo.premiere_date) ?? undefined,
      categories: (videoInfo.categories as string[]) ?? undefined,
      subtitles,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const { id: videoId, player_id: playerId, target, type: urlType, display_id: displayId } = m.groups!;

    if (videoId) {
      return this._extractVideo({ videoId, playerId, target });
    }

    const webpage = await this._download_webpage(url, displayId);

    if (urlType === 'series') {
      return this._extractSeries(url, webpage);
    }

    const params = this._extractVideoParams(webpage, displayId!);
    const ldInfo = this._search_json_ld(webpage, displayId, { fatal: false });
    if (!params?.videoId) {
      throw new ExtractorError(`Unable to extract CondeNast video params for ${displayId}`, { expected: true });
    }
    const videoInfo = await this._extractVideo(params);
    return { ...ldInfo, ...videoInfo };
  }
}

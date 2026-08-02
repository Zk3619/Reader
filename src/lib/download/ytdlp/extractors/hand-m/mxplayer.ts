/**
 * Mxplayer family — ported from yt-dlp mxplayer.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  float_or_none,
  int_or_none,
  join_nonempty,
  parse_qs,
  str_or_none,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  mergeSubtitles,
  orderedSet,
  parseIso8601,
  urljoin,
} from './_helpers';

export class MxplayerBaseIE extends InfoExtractor {
  static IE_NAME = 'mxplayerbase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _BASE_URL = 'https://www.mxplayer.in';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('MxplayerBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractMxs(url: string, itemId: string): Promise<Record<string, unknown>> {
    const webpage = await this._download_webpage(url, itemId);
    const errorMsg = clean_html(
      webpage.match(/class="sub-message"[^>]*>([\s\S]*?)<\//i)?.[1] || '',
    );
    if (errorMsg) this.raise_geo_restricted(errorMsg, ['IN']);
    return this._search_json<Record<string, unknown>>(/window\.__mxs__\s*=/, webpage, 'mxs', itemId) || {};
  }
}

export class MxplayerIE extends MxplayerBaseIE {
  static IE_NAME = 'mxplayer';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?mxplayer\.in\/(?:movie|shorts|show\/[\w-]+\/(?!seasons\/)[\w-]+)\/(?<display_id>[\w-]+)-(?<id>[0-9a-f]{32})(?:[/?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups?.display_id ?? '';
    const videoId = m.groups?.id ?? '';
    const mxs = await this._extractMxs(url, videoId);

    const config = (mxs.config as Record<string, unknown>) || {};
    const cdnBase = str_or_none(config.videoCdnBaseUrl)?.replace(/\/$/, '') + '/';
    const imgBase = str_or_none(config.imageBaseUrl)?.replace(/\/$/, '') + '/';
    const entities = (mxs.entities as Record<string, Record<string, unknown>>)?.[videoId] || {};
    const stream = (entities.stream as Record<string, unknown>) || {};

    if (stream.drmProtect) this.report_warning(`${videoId}: content is DRM protected`);

    const manifestUrls = orderedSet<string>(
      [
        ...Object.values((stream.thirdParty as Record<string, string>) || {}).map(String),
        ...['hls', 'dash'].flatMap((k) => {
          const high = (stream[k === 'hls' ? 'hls' : 'dash'] as Record<string, unknown>)?.high;
          return high && cdnBase ? [urljoin(cdnBase, String(high))] : [];
        }),
        ...(stream.mxplay
          ? ['hls', 'dash'].map((k) => {
              const node = (stream.mxplay as Record<string, unknown>)?.[k] as Record<string, unknown>;
              return node?.high && cdnBase ? urljoin(cdnBase, String(node.high)) : null;
            }).filter(Boolean) as string[]
          : []),
      ].filter(Boolean) as string[],
    );

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const manifestUrl of manifestUrls) {
      const ext = determine_ext(manifestUrl);
      if (ext === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, manifestUrl, videoId, 'hls');
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      } else if (ext === 'mpd') {
        const res = await extractMpdFormatsAndSubtitles(this, manifestUrl, videoId, 'dash');
        for (const fmt of res.formats) {
          if (fmt.tbr != null) fmt.tbr = float_or_none(fmt.tbr / 4.2) ?? fmt.tbr;
        }
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      }
    }

    const seen = new Set<string>();
    const deduped = formats.filter((f) => {
      const key = f.format_id || f.url || '';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const container = (entities.container as Record<string, unknown>) || {};
    const parentContainer = (container.container as Record<string, unknown>) || {};
    const contributors = (entities.contributors as Array<Record<string, unknown>>) || [];

    return {
      id: videoId,
      display_id: displayId,
      formats: deduped,
      subtitles,
      title: clean_html(str_or_none(entities.title)) || undefined,
      age_limit: int_or_none(entities.rating) ?? undefined,
      description: clean_html(str_or_none(entities.description)) || undefined,
      duration: int_or_none(entities.duration) ?? undefined,
      episode_number: int_or_none(entities.sequence) ?? undefined,
      genres: ((entities.genres as string[]) || []).map((g) => clean_html(g)).filter(Boolean) as string[],
      release_timestamp: parseIso8601(entities.releaseDate) ?? undefined,
      tags: ((entities.tags as Array<{ name?: string }>) || [])
        .map((t) => clean_html(str_or_none(t.name)))
        .filter(Boolean) as string[],
      thumbnails: [
        ...(((entities.imageInfo as Record<string, unknown>)?.titleContentImageInfo as Array<Record<string, unknown>>) || []),
        ...(((entities.titleContentImageInfo as Array<Record<string, unknown>>) || [])),
      ]
        .map((img) => ({
          id: str_or_none(img.type) ?? undefined,
          height: int_or_none(img.height) ?? undefined,
          url: img.url && imgBase ? urljoin(imgBase, String(img.url)) : url_or_none(img.url) || undefined,
          width: int_or_none(img.width) ?? undefined,
        }))
        .filter((t): t is typeof t & { url: string } => !!t.url),
      timestamp: parseIso8601(entities.publishTime) ?? undefined,
      view_count: int_or_none(entities.viewCount) ?? undefined,
      season: clean_html(str_or_none(container.title)) || undefined,
      season_number: int_or_none(container.sequence) ?? undefined,
      series: clean_html(str_or_none(parentContainer.title)) || undefined,
      cast: contributors.filter((c) => c.type === 'actor').map((c) => clean_html(str_or_none(c.name))).filter(Boolean) as string[],
      creators: contributors.filter((c) => c.type === 'director').map((c) => clean_html(str_or_none(c.name))).filter(Boolean) as string[],
    };
  }
}

export class MxplayerSeasonIE extends MxplayerBaseIE {
  static IE_NAME = 'mxplayer:season';
  static _PAGE_SIZE = 10;
  static _VALID_URL =
    /https?:\/\/(?:www\.)?mxplayer\.in\/show\/[\w-]+\/seasons\/[\w-]+-(?<id>[0-9a-f]{32})(?:[/?#]|$)/;

  protected async *_entries(entities: Record<string, unknown>, seasonId: string): AsyncGenerator<VideoInfo> {
    const apiUrl =
      ((entities.tabs as Array<Record<string, unknown>>) || [])
        .map((t) => url_or_none(t.api))
        .find(Boolean) || '';
    const baseApi = apiUrl ? urljoin('https://api.mxplayer.in/v1/web/', apiUrl) : '';
    if (!baseApi) return;

    let query: Record<string, string> | undefined;
    for (let page = 1; ; page++) {
      const seasonData = await this._download_json<Record<string, unknown>>(
        baseApi,
        seasonId,
        `Downloading Page ${page}`,
        { query },
      );
      const shareUrls = ((seasonData.items as Array<Record<string, unknown>>) || [])
        .map((item) => url_or_none(item.shareUrl))
        .filter(Boolean)
        .map((u) => urljoin(`${MxplayerBaseIE._BASE_URL}/`, u!));
      for (const shareUrl of shareUrls) {
        yield this.url_result(shareUrl, 'mxplayer:redirect');
      }
      if (shareUrls.length < MxplayerSeasonIE._PAGE_SIZE) break;
      query = Object.fromEntries(
        Object.entries(parse_qs(str_or_none(seasonData.next) || '')).map(([k, v]) => [k, v[0] ?? '']),
      );
      if (!Object.keys(query).length) break;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const seasonId = this._match_id(url);
    const mxs = await this._extractMxs(url, seasonId);
    const entities = (mxs.entities as Record<string, Record<string, unknown>>)?.[seasonId] || {};
    const seriesTitle = clean_html(str_or_none((entities.container as Record<string, unknown>)?.title));
    const seasonTitle = clean_html(str_or_none(entities.title));
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(entities, seasonId)) entries.push(entry);
    return this.playlist_result(entries, seasonId, join_nonempty(seriesTitle, seasonTitle, ' - ') || seasonId);
  }
}

export class MxplayerShowIE extends MxplayerBaseIE {
  static IE_NAME = 'mxplayer:show';
  static _VALID_URL = /https?:\/\/(?:www\.)?mxplayer\.in\/show\/[\w-]+-(?<id>[0-9a-f]{32})(?:[/?#]|$)/;

  protected _entries(entities: Record<string, unknown>): VideoInfo[] {
    return ((entities.tabs as Array<Record<string, unknown>>) || [])
      .flatMap((tab) => ((tab.containers as Array<Record<string, unknown>>) || []).map((c) => str_or_none(c.id)))
      .filter(Boolean)
      .map((seasonId) =>
        this.url_result(`${MxplayerBaseIE._BASE_URL}/detail/season/${seasonId}`, 'mxplayer:redirect'),
      );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const showId = this._match_id(url);
    const mxs = await this._extractMxs(url, showId);
    const entities = (mxs.entities as Record<string, Record<string, unknown>>)?.[showId] || {};
    return this.playlist_result(
      this._entries(entities),
      showId,
      clean_html(str_or_none(entities.title)) || showId,
    );
  }
}

export class MxplayerRedirectIE extends MxplayerBaseIE {
  static IE_NAME = 'mxplayer:redirect';
  static _IE_MAP: Record<string, typeof MxplayerIE | typeof MxplayerSeasonIE | typeof MxplayerShowIE> = {
    episode: MxplayerIE,
    movie: MxplayerIE,
    season: MxplayerSeasonIE,
    shorts: MxplayerIE,
    tvshow: MxplayerShowIE,
  };
  static _VALID_URL =
    /https?:\/\/(?:www\.)?mxplayer\.in\/detail\/(?<type>episode|movie|season|shorts|tvshow)\/(?<id>[0-9a-f]{32})(?:[/?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const redirectType = m.groups?.type ?? '';
    const redirectId = m.groups?.id ?? '';
    const ieKey = (this.constructor as typeof MxplayerRedirectIE)._IE_MAP[redirectType]?.IE_NAME || 'mxplayer';

    const detail = await this._download_json<{ data?: { redirect?: string } }>(
      'https://seo.mxplayer.in/v1/api/seo/get-url-details',
      redirectId,
      undefined,
      { query: { url: new URL(url).pathname } },
    );
    const redirectUrl = detail.data?.redirect
      ? urljoin(`${MxplayerBaseIE._BASE_URL}/`, detail.data.redirect)
      : null;

    if (redirectUrl) {
      if (MxplayerRedirectIE.suitable(redirectUrl)) {
        throw new ExtractorError(`Unsupported redirect loop: ${redirectUrl}`, { expected: true });
      }
      return this.url_result(redirectUrl, ieKey);
    }

    throw new ExtractorError('Unable to resolve redirect URL', { expected: true });
  }
}

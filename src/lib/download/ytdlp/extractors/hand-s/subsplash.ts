/** SubsplashBaseIE / SubsplashIE / SubsplashPlaylistIE — ported from yt-dlp subsplash.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, url_or_none, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parse_iso8601 } from './_helpers';

function tryCall<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export class SubsplashBaseIE extends InfoExtractor {
  static IE_NAME = 'subsplashbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected async _getHeaders(url: string, displayId: string): Promise<Record<string, string> | null> {
    let token = tryCall(() => this._get_cookies(url)['ss-token-guest']);
    if (!token) {
      const webpage = await this._download_webpage(url, displayId);
      token =
        tryCall(() => this._get_cookies(url)['ss-token-guest']) ||
        this._search_regex(
          /\\"tokens\\":\{\\"guest\\":\\"([A-Za-z0-9._-]+)\\"/,
          webpage,
          'token',
          null,
          false,
        ) ||
        undefined;
      const shoebox = this._search_json<Record<string, unknown>>(
        /<script[^>]+\bid="shoebox-tokens"[^>]*>/,
        webpage,
        'shoebox tokens',
        displayId,
        { default: {} },
      );
      token = token || (shoebox?.apiToken as string | undefined);
    }
    if (!token) {
      this.report_warning('Unable to extract auth token');
      return null;
    }
    return { Authorization: `Bearer ${token}` };
  }

  protected async _extractVideo(data: Record<string, unknown>, videoId: string): Promise<VideoInfo> {
    const formats: Format[] = [];
    const videoData = traverse_obj(data, ['_embedded', 'video', '_embedded']) as Record<string, unknown> | undefined;
    const m3u8Url = url_or_none(traverse_obj(videoData, ['playlists', 0, '_links', 'related', 'href']));
    if (m3u8Url) {
      const res = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');
      formats.push(...res.formats);
    }
    const mp4Entry = traverse_obj(videoData, [
      'video-outputs',
      (v: unknown) =>
        url_or_none((v as Record<string, unknown>)?._links &&
          ((v as Record<string, Record<string, Record<string, string>>>)._links.related?.href)),
    ]) as Record<string, unknown> | undefined;
    if (mp4Entry) {
      formats.push({
        url: (mp4Entry._links as Record<string, Record<string, string>>).related.href,
        format_id: 'direct',
        quality: 1,
        height: int_or_none(mp4Entry.height) ?? undefined,
        width: int_or_none(mp4Entry.width) ?? undefined,
        filesize: int_or_none(mp4Entry.file_size) ?? undefined,
      });
    }
    return {
      id: videoId,
      formats,
      title: data.title != null ? String(data.title) : undefined,
      description: data.summary_text != null ? String(data.summary_text) : undefined,
      thumbnail: url_or_none(traverse_obj(data, ['_embedded', 'images', 0, '_links', 'related', 'href'])) || undefined,
      duration: int_or_none(traverse_obj(data, ['_embedded', 'video', 'duration']), 1000) ?? undefined,
      timestamp: parse_iso8601(data.date) ?? undefined,
      release_timestamp: parse_iso8601(data.published_at) ?? undefined,
      modified_timestamp: parse_iso8601(data.updated_at) ?? undefined,
    };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('SubsplashBaseIE is not a standalone extractor');
  }
}

export class SubsplashIE extends SubsplashBaseIE {
  static IE_NAME = 'subsplash';
  static _VALID_URL = [
    /https?:\/\/(?:www\.)?subsplash\.com\/(?:u\/)?[^/?#]+\/[^/?#]+\/(?:d\/|mi\/\+)(?<id>\w+)/,
    /https?:\/\/(?:\w+\.)?subspla\.sh\/(?<id>\w+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const headers = (await this._getHeaders(url, videoId)) || undefined;
    const data = await this._download_json<{ _embedded?: { 'media-items'?: Record<string, unknown>[] } }>(
      'https://core.subsplash.com/media/v1/media-items',
      videoId,
      undefined,
      {
        headers,
        query: {
          'filter[short_code]': videoId,
          include: 'images,audio.audio-outputs,audio.video,video.video-outputs,video.playlists,document,broadcast',
        },
      },
    );
    return this._extractVideo(data._embedded?.['media-items']?.[0] || {}, videoId);
  }
}

export class SubsplashPlaylistIE extends SubsplashBaseIE {
  static IE_NAME = 'subsplash:playlist';
  static _PAGE_SIZE = 15;
  static _VALID_URL =
    /https?:\/\/(?:www\.)?subsplash\.com\/[^/?#]+\/(?:our-videos|media)\/ms\/\+(?<id>\w+)/;

  protected async _entries(seriesId: string, headers: Record<string, string>, page: number): Promise<VideoInfo[]> {
    const data = await this._download_json<{ _embedded?: { 'media-items'?: Record<string, unknown>[] } }>(
      'https://core.subsplash.com/media/v1/media-items',
      seriesId,
      `Downloading page ${page + 1}`,
      {
        headers,
        query: {
          'filter[broadcast.status|broadcast.status]': 'null|on-demand',
          'filter[media_series]': seriesId,
          'filter[status]': 'published',
          include: 'images,audio.audio-outputs,audio.video,video.video-outputs,video.playlists,document',
          'page[number]': String(page + 1),
          'page[size]': String(SubsplashPlaylistIE._PAGE_SIZE),
          sort: '-position',
        },
      },
    );
    const out: VideoInfo[] = [];
    for (const entry of data._embedded?.['media-items'] || []) {
      const entryId = String(entry.short_code || '');
      if (!entryId) continue;
      out.push({
        ...(await this._extractVideo(entry, entryId)),
        webpage_url: `https://subspla.sh/${entryId}`,
        extractor_key: 'Subsplash',
        extractor: 'subsplash',
      });
    }
    return out;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const headers = (await this._getHeaders(url, displayId)) || {};
    const data = await this._download_json<{ _embedded?: { 'media-series'?: Record<string, unknown>[] } }>(
      'https://core.subsplash.com/media/v1/media-series',
      displayId,
      undefined,
      { headers, query: { 'filter[short_code]': displayId } },
    );
    const seriesData = data._embedded?.['media-series']?.[0] || {};
    const seriesId = String(seriesData.id || displayId);
    const title = seriesData.title != null ? String(seriesData.title) : undefined;
    const count = int_or_none(seriesData.media_items_count) || 0;
    const totalPages = Math.ceil(count / SubsplashPlaylistIE._PAGE_SIZE);
    const entries: VideoInfo[] = [];
    for (let page = 0; page < totalPages; page++) {
      entries.push(...(await this._entries(seriesId, headers, page)));
    }
    return this.playlist_result(entries, displayId, title);
  }
}

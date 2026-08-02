/**
 * LRTStreamIE / LRTVODIE / LRTRadioIE — ported from yt-dlp lrt.py
 */

import { InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { clean_html, unified_timestamp, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parseJwplayerData, urljoin } from './_helpers';

export class LRTStreamIE extends InfoExtractor {
  static IE_NAME = 'lrt:stream';
  static _VALID_URL = /https?:\/\/(?:www\.)?lrt\.lt\/mediateka\/tiesiogiai\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const getStreamUrl = this._search_regex(/\\"get_streams_url\\":\\"([^"]+)\\"/, webpage, 'stream URL')!;
    const streamsData = await this._download_json<Record<string, unknown>>(getStreamUrl, videoId);

    let formats: VideoInfo['formats'] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    const response = (streamsData.response as Record<string, unknown>) || {};
    const data = (response.data as Record<string, unknown>) || {};
    for (const [key, val] of Object.entries(data)) {
      if (!key.startsWith('content')) continue;
      const streamUrl = url_or_none(val);
      if (!streamUrl) continue;
      const res = await extractM3u8FormatsAndSubtitles(this, streamUrl, videoId, 'hls');
      formats.push(...res.formats.map((f) => ({ ...f, is_live: true })));
      subtitles = mergeSubtitles(subtitles, res.subtitles);
    }

    return {
      id: videoId,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      is_live: true,
      title: this._og_search_title(webpage, false) || videoId,
    };
  }
}

export class LRTVODIE extends InfoExtractor {
  static IE_NAME = 'lrt:vod';
  static _VALID_URL = [
    /https?:\/\/(?:(?:www|archyvai)\.)?lrt\.lt\/mediateka\/irasas\/(?<id>[0-9]+)/,
    /https?:\/\/(?:(?:www|archyvai)\.)?lrt\.lt\/mediateka\/video\/[^?#]+\?(?:[^#]*&)?episode=(?<id>[0-9]+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const canonicalUrl =
      this._search_regex(/\\"(?:article|data)\\":{[^}]*\\"url\\":\\"(\/[^"]+)\\"/, webpage, 'content URL', null, false) ||
      this._search_regex(/<link\s+rel="canonical"\s*href="(\/[^"]+)"/, webpage, 'canonical URL')!;

    const media = await this._download_json<Record<string, unknown>>(
      'https://www.lrt.lt/servisai/stream_url/vod/media_info/',
      videoId,
      undefined,
      { query: { url: canonicalUrl } },
    );

    const jwData = await parseJwplayerData(this, media.playlist_item, videoId, { baseUrl: url });
    const tags = ((media.tags as Array<Record<string, unknown>>) || []).map((t) => String(t.name ?? '')).filter(Boolean);

    return {
      ...jwData,
      id: String(media.id ?? videoId),
      title: String(media.title ?? jwData.title ?? videoId),
      description: clean_html(String(media.content ?? '')) || undefined,
      timestamp: unified_timestamp(String(media.date ?? '').replace(/\./g, '/')) ?? undefined,
      tags: tags.length ? tags : undefined,
    };
  }
}

export class LRTRadioIE extends InfoExtractor {
  static IE_NAME = 'lrt:radio';
  static _VALID_URL = /https?:\/\/(?:www\.)?lrt\.lt\/radioteka\/irasas\/(?<id>\d+)\/(?<path>[^?#/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id || this._match_id(url);
    const path = m.groups?.path || '';
    const media = await this._download_json<Record<string, unknown>>(
      'https://www.lrt.lt/rest-api/media',
      videoId,
      undefined,
      { query: { url: `/mediateka/irasas/${videoId}/${path}` } },
    );

    const playlistItem = (media.playlist_item as Record<string, unknown>) || {};
    const categories = playlistItem.category
      ? [String(playlistItem.category)].filter(Boolean)
      : undefined;

    return {
      id: videoId,
      formats: await this._extract_m3u8_formats(String(playlistItem.file ?? ''), videoId),
      title: String(media.title ?? videoId),
      tags: ((media.tags as Array<Record<string, unknown>>) || []).map((t) => String(t.name ?? '')).filter(Boolean),
      categories,
      description: clean_html(String(media.content ?? '')) || undefined,
      timestamp: unified_timestamp(String(media.date ?? '').replace(/\./g, '/')) ?? undefined,
      thumbnail: playlistItem.image
        ? urljoin('https://www.lrt.lt', String(playlistItem.image))
        : undefined,
    };
  }
}

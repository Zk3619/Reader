/**
 * LocipoBaseIE / LocipoIE / LocipoPlaylistIE — ported from yt-dlp locipo.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, js_to_json, parse_qs, str_or_none, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parse_iso8601 } from './_helpers';

const UUID_RE = /[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}/;

export class LocipoBaseIE extends InfoExtractor {
  static IE_NAME = 'locipobase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  protected _API_BASE = 'https://web-api.locipo.jp';
  protected _BASE_URL = 'https://locipo.jp';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('LocipoBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(path: string, itemId: string, note: string, fatal = true): Promise<Record<string, unknown>> {
    return (
      (await this._download_json<Record<string, unknown>>(`${this._API_BASE}/${path}`, itemId, note, {
        fatal,
      })) || {}
    );
  }

  protected async _extractFromStreaksApi(
    projectId: string,
    mediaId: string,
    headers: Record<string, string>,
  ): Promise<Partial<VideoInfo>> {
    const apiUrl = `https://playback.api.streaks.jp/v1/projects/${projectId}/medias/${mediaId}`;
    const response = await this._download_json<Record<string, unknown>>(apiUrl, mediaId, 'Downloading STREAKS playback API JSON', {
      headers: {
        Accept: 'application/json',
        Origin: 'https://players.streaks.jp',
        ...this.geo_verification_headers(),
        ...headers,
      },
    });

    const liveStatusMap: Record<string, string> = { clip: 'was_live', file: 'not_live', linear: 'is_live', live: 'is_live' };
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    for (const source of (response.sources as Array<Record<string, unknown>>) || []) {
      if (source.key_systems) continue;
      const srcUrl = str_or_none(source.src);
      if (!srcUrl || !srcUrl.includes('.m3u8')) continue;
      const isLive = liveStatusMap[String(response.type || '')] === 'is_live';
      const res = await extractM3u8FormatsAndSubtitles(this, srcUrl, mediaId, 'hls');
      formats.push(...res.formats.map((f) => ({ ...f, ...(isLive ? { is_live: true } : {}) })));
      subtitles = mergeSubtitles(subtitles, res.subtitles);
    }

    for (const track of (response.tracks as Array<Record<string, unknown>>) || []) {
      if (!['captions', 'subtitles'].includes(String(track.kind || ''))) continue;
      const trackUrl = str_or_none(track.src);
      if (!trackUrl) continue;
      const lang = str_or_none(track.srclang)?.toLowerCase() || 'ja';
      if (!subtitles[lang]) subtitles[lang] = [];
      subtitles[lang]!.push({ url: trackUrl, ext: 'vtt' });
    }

    return {
      id: String(response.id ?? mediaId),
      display_id: mediaId,
      formats,
      live_status: liveStatusMap[String(response.type || '')] as VideoInfo['live_status'],
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      uploader_id: projectId,
      timestamp: parse_iso8601(response.updated_at) ?? undefined,
      modified_timestamp: parse_iso8601(response.updated_at) ?? undefined,
    };
  }
}

export class LocipoIE extends LocipoBaseIE {
  static IE_NAME = 'locipo';
  static _VALID_URL = [
    new RegExp(`https?:\\/\\/locipo\\.jp\\/creative\\/(?<id>${UUID_RE.source})`),
    new RegExp(`https?:\\/\\/locipo\\.jp\\/embed\\/\\?(?:[^#]+&)?id=(?<id>${UUID_RE.source})`),
  ];

  protected _yesPlaylist(playlistId: string | undefined, videoId: string): boolean {
    return !!playlistId && playlistId !== videoId && !this.params.noplaylist;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const qs = parse_qs(url);
    const playlistId = qs.list?.[qs.list.length - 1];
    if (this._yesPlaylist(playlistId, videoId)) {
      return this.url_result(`${this._BASE_URL}/playlist/${playlistId}`, 'LocipoPlaylist');
    }

    const creatives = await this._callApi(`creatives/${videoId}`, videoId, 'Creatives');
    const mediaId = str_or_none(creatives.media_id);
    if (!mediaId) throw new ExtractorError('Unable to extract Streaks media ID');

    const webpage = await this._download_webpage(url, videoId);
    const config = this._parse_json<Record<string, unknown>>(
      js_to_json(this._search_regex(/window\.__NUXT__\.config\s*=/, webpage, 'config', null, false) || '{}'),
      videoId,
      null,
      false,
    );
    const apiKey = str_or_none(traverse_obj(config, ['public', 'streaksVodPlaybackApiKey']));
    if (!apiKey) throw new ExtractorError('Unable to extract api key');

    const streaks = await this._extractFromStreaksApi('locipo-prod', mediaId, {
      Origin: 'https://locipo.jp',
      'X-Streaks-Api-Key': apiKey,
    });

    const series = (creatives.series as Record<string, unknown>) || {};
    const keyword = str_or_none(creatives.keyword);

    return {
      ...streaks,
      id: videoId,
      title: clean_html(str_or_none(creatives.name)) || videoId,
      description: clean_html(str_or_none(creatives.description)) || undefined,
      release_timestamp: parse_iso8601(creatives.publication_started_at) ?? undefined,
      tags: keyword ? keyword.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      uploader: clean_html(str_or_none(traverse_obj(creatives, ['company', 'name']))) || undefined,
      series: clean_html(str_or_none(series.name)) || undefined,
      series_id: str_or_none(series.id) ?? undefined,
    };
  }
}

export class LocipoPlaylistIE extends LocipoBaseIE {
  static IE_NAME = 'locipo:playlist';
  static _VALID_URL = [
    new RegExp(`https?:\\/\\/locipo\\.jp\\/(?<type>playlist)\\/(?<id>${UUID_RE.source})`),
    /https?:\/\/locipo\.jp\/(?<type>series)\/(?<id>\d+)/,
  ];
  static _PAGE_SIZE = 100;

  protected async _fetchPage(path: string, playlistId: string, page: number): Promise<VideoInfo[]> {
    const creatives = await this._download_json<Record<string, unknown>>(
      `${this._API_BASE}/${path}/${playlistId}/creatives`,
      playlistId,
      `Downloading page ${page + 1}`,
      {
        query: { premium: 'false', live: 'false', limit: String(LocipoPlaylistIE._PAGE_SIZE), offset: String(page * LocipoPlaylistIE._PAGE_SIZE) },
      },
    );
    return ((creatives.items as Array<Record<string, unknown>>) || [])
      .map((item) => str_or_none(item.id))
      .filter(Boolean)
      .map((id) => this.url_result(`${this._BASE_URL}/creative/${id}`, 'Locipo'));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let playlistType = m.groups?.type || 'playlist';
    let playlistId = m.groups?.id || this._match_id(url);

    const head = await this._request_webpage(url, playlistId, undefined, { fatal: false });
    if (head?.url) {
      const redirectMatch = head.url.match(/locipo\.jp\/(playlist|series)\/([^/?#]+)/);
      if (redirectMatch) {
        playlistType = redirectMatch[1]!;
        playlistId = redirectMatch[2]!;
      }
    }

    const path = playlistType === 'playlist' ? 'playlists' : 'series';
    const creatives = await this._callApi(`${path}/${playlistId}/creatives`, playlistId, path);

    const total = Number(creatives.total ?? 0);
    const totalPages = Math.ceil(total / LocipoPlaylistIE._PAGE_SIZE) || 1;
    const entries: VideoInfo[] = [];
    for (let page = 0; page < totalPages; page++) {
      entries.push(...(await this._fetchPage(path, playlistId, page)));
    }

    let title = playlistId;
    let description: string | undefined;
    for (const item of (creatives.items as Array<Record<string, unknown>>) || []) {
      const block = item[playlistType] as Record<string, unknown> | undefined;
      if (block) {
        title = clean_html(str_or_none(block.name)) || title;
        description = clean_html(str_or_none(block.description)) || description;
        break;
      }
    }

    return this.playlist_result(entries, playlistId, title, description);
  }
}

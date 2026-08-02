/** RTNews* — ported from yt-dlp rtnews.py (main paths) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { js_to_json } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class RTNewsIE extends InfoExtractor {
  static IE_NAME = 'RTNews';
  static _VALID_URL = /https?:\/\/(?:www\.)?rt\.com\/[^/]+\/(?:[^/]+\/)?(?<id>\d+)/;

  protected *_entries(webpage: string): Generator<VideoInfo> {
    const videoUrls = new Set([...webpage.matchAll(/https:\/\/cdnv\.rt\.com\/[\s\S]*?[a-f0-9]+\.mp4/g)].map((m) => m[0]!));
    for (const vUrl of videoUrls) {
      const vId = vUrl.match(/([a-f0-9]+)\.mp4/)?.[1];
      if (vId) yield { id: vId, title: vId, url: vUrl };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    return {
      _type: 'playlist',
      id: playlistId,
      entries: [...this._entries(webpage)],
      title: this._og_search_title(webpage) ?? undefined,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
    };
  }
}

export class RTDocumentryIE extends InfoExtractor {
  static IE_NAME = 'RTDocumentry';
  static _VALID_URL = /https?:\/\/rtd\.rt\.com\/(?:(?:series|shows)\/[^/]+|films)\/(?<id>[^/?$&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const ldJson = this._search_json_ld(webpage, videoId, { fatal: false });
    if (!ldJson) {
      throw new ExtractorError('No video/audio found at the provided url.', { expected: true });
    }
    const mediaRaw = this._search_regex(/'Med'\s*:\s*\[\s*(\{[\s\S]+?\})\s*\]\s*};/, webpage, 'media info');
    const mediaJson = this._parse_json(mediaRaw!, videoId, js_to_json) as Record<string, unknown>;
    if (!('title' in ldJson) && mediaJson.title) (ldJson as Record<string, unknown>).title = mediaJson.title;
    const formats: Format[] = [];
    for (const src of (mediaJson.sources as Array<{ file?: string }>) || []) {
      if (src.file) formats.push({ url: src.file, format_id: 'http' });
    }
    return { id: videoId, thumbnail: mediaJson.image as string | undefined, formats, ...(ldJson as Partial<VideoInfo>), title: (ldJson as Partial<VideoInfo>).title };
  }
}

export class RTDocumentryPlaylistIE extends InfoExtractor {
  static IE_NAME = 'RTDocumentryPlaylist';
  static _VALID_URL = /https?:\/\/rtd\.rt\.com\/(?:series|shows)\/(?<id>[^/]+)\/$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const entries: VideoInfo[] = [];
    for (const vUrl of new Set([...webpage.matchAll(/list-2__link\s*"\s*href="([^"]+)"/g)].map((m) => m[1]!))) {
      if (!vUrl.includes(playlistId)) continue;
      entries.push(this.url_result(`https://rtd.rt.com${vUrl}`, 'RTDocumentry'));
    }
    return { _type: 'playlist', id: playlistId, entries };
  }
}

export class RuptlyIE extends InfoExtractor {
  static IE_NAME = 'Ruptly';
  static _VALID_URL = /https?:\/\/(?:www\.)?ruptly\.tv\/[a-z]{2}\/videos\/(?<id>\d+-\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const m3u8Url = this._search_regex(
      /preview_url"\s?:\s?"(https?:\/\/storage\.ruptly\.tv\/video_projects\/.+\.m3u8)"/,
      webpage,
      'm3u8 url',
      null,
      false,
    );
    if (!m3u8Url) throw new ExtractorError('No video/audio found at the provided url.', { expected: true });
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');
    return {
      id: videoId,
      formats,
      subtitles,
      title: this._og_search_title(webpage) ?? undefined,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
    };
  }
}

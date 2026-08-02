/** RedGifs* — ported from yt-dlp redgifs.py (main paths) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_qs, try_get } from '../../utils';

const FORMATS: Record<string, number | null> = { gif: 250, sd: 480, hd: null };

export class RedGifsBaseIE extends InfoExtractor {
  static IE_NAME = 'RedGifsBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _API_HEADERS: Record<string, string> = {
    referer: 'https://www.redgifs.com/',
    origin: 'https://www.redgifs.com',
    'content-type': 'application/json',
  };
  static _PAGE_SIZE = 80;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RedGifsBaseIE is not a standalone extractor', { expected: true });
  }

  protected _parseGifData(gifData: Record<string, unknown>): VideoInfo {
    const videoId = String(gifData.id || '');
    const origHeight = int_or_none(gifData.height);
    const aspectRatio = try_get(gifData, (x) => (x.width as number) / (x.height as number));
    const urls = (gifData.urls as Record<string, string>) || {};
    const formats: Format[] = [];
    const formatKeys = Object.keys(FORMATS);
    for (let i = 0; i < formatKeys.length; i++) {
      const formatId = formatKeys[i]!;
      const maxH = FORMATS[formatId];
      const videoUrl = urls[formatId];
      if (!videoUrl) continue;
      const height = origHeight && maxH ? Math.min(origHeight, maxH) : origHeight ?? maxH ?? undefined;
      formats.push({
        url: videoUrl,
        format_id: formatId,
        width: height && aspectRatio ? int_or_none(Math.trunc(height * aspectRatio)) ?? undefined : undefined,
        height: height ?? undefined,
        quality: formatKeys.length - i,
      });
    }
    return {
      id: videoId,
      webpage_url: `https://redgifs.com/watch/${videoId}`,
      extractor_key: 'RedGifs',
      extractor: 'RedGifs',
      title: ((gifData.tags as string[]) || []).join(' ') || 'RedGifs',
      timestamp: int_or_none(gifData.createDate) ?? undefined,
      uploader: gifData.userName as string | undefined,
      duration: int_or_none(gifData.duration) ?? undefined,
      view_count: int_or_none(gifData.views) ?? undefined,
      like_count: int_or_none(gifData.likes) ?? undefined,
      categories: (gifData.tags as string[]) || [],
      tags: gifData.tags as string[] | undefined,
      age_limit: 18,
      formats,
    };
  }

  protected async _fetchOauthToken(videoId: string) {
    const auth = await this._download_json<{ token?: string }>(
      'https://api.redgifs.com/v2/auth/temporary',
      videoId,
      'Fetching temporary token',
    );
    if (!auth.token) throw new ExtractorError('Unable to get temporary token');
    RedGifsBaseIE._API_HEADERS.authorization = `Bearer ${auth.token}`;
  }

  protected async _callApi(ep: string, videoId: string, note?: string, opts: Record<string, unknown> = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!RedGifsBaseIE._API_HEADERS.authorization) await this._fetchOauthToken(videoId);
      try {
        const data = await this._download_json<Record<string, unknown>>(`https://api.redgifs.com/v2/${ep}`, videoId, note, {
          headers: { ...RedGifsBaseIE._API_HEADERS, 'x-customheader': `https://www.redgifs.com/watch/${videoId}` },
          ...opts,
        });
        if (data.error) throw new ExtractorError(`RedGifs said: ${data.error}`, { expected: true });
        return data;
      } catch (e) {
        const status = (e as { cause?: { status?: number } }).cause?.status;
        if (attempt === 0 && status === 401) {
          delete RedGifsBaseIE._API_HEADERS.authorization;
          continue;
        }
        throw e;
      }
    }
    throw new ExtractorError('RedGifs API request failed');
  }

  protected async *_fetchPage(ep: string, videoId: string, query: Record<string, string | number>, page: number) {
    query.page = page + 1;
      const data = await this._callApi(ep, videoId, `Downloading JSON metadata page ${page + 1}`, { query });
    for (const entry of (data.gifs as Array<Record<string, unknown>>) || []) {
      yield this._parseGifData(entry);
    }
  }
}

export class RedGifsIE extends RedGifsBaseIE {
  static IE_NAME = 'RedGifs';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?redgifs\.com\/(?:watch|ifr)\/|thumbs2\.redgifs\.com\/)(?<id>[^-/?#.]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url).toLowerCase();
    const videoInfo = await this._callApi(`gifs/${videoId}?views=yes`, videoId, 'Downloading video info');
    return this._parseGifData((videoInfo.gif as Record<string, unknown>) || {});
  }
}

export class RedGifsSearchIE extends RedGifsBaseIE {
  static IE_NAME = 'RedGifsSearch';
  static IE_DESC = 'Redgifs search';
  static _VALID_URL = /https?:\/\/(?:www\.)?redgifs\.com\/browse\?(?<query>[^#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const queryStr = this._match_valid_url(url)!.groups!.query!;
    const query = parse_qs(queryStr);
    if (!query.tags?.[0]) throw new ExtractorError('Invalid query tags', { expected: true });
    const tags = query.tags[0];
    const order = query.order?.[0] || 'trending';
    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      const q: Record<string, string | number> = {
        search_text: tags,
        order,
        type: query.type?.[0] || '',
      };
      let count = 0;
      for await (const entry of this._fetchPage('gifs/search', queryStr, q, page)) {
        entries.push(entry);
        count++;
      }
      if (count < RedGifsBaseIE._PAGE_SIZE) break;
      if (query.page?.[0]) break;
    }
    return this.playlist_result(entries, queryStr, tags, `RedGifs search for ${tags}, ordered by ${order}`);
  }
}

export class RedGifsUserIE extends RedGifsBaseIE {
  static IE_NAME = 'RedGifsUser';
  static IE_DESC = 'Redgifs user';
  static _VALID_URL = /https?:\/\/(?:www\.)?redgifs\.com\/users\/(?<username>[^/?#]+)(?:\?(?<query>[^#]+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const username = m.groups!.username!;
    const queryStr = m.groups!.query;
    const playlistId = queryStr ? `${username}?${queryStr}` : username;
    const query = parse_qs(queryStr || '');
    const order = query.order?.[0] || 'recent';
    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      const q: Record<string, string | number> = { order, type: query.type?.[0] || '' };
      let count = 0;
      for await (const entry of this._fetchPage(`users/${username}/search`, playlistId, q, page)) {
        entries.push(entry);
        count++;
      }
      if (count < RedGifsBaseIE._PAGE_SIZE) break;
      if (query.page?.[0]) break;
    }
    return this.playlist_result(entries, playlistId, username, `RedGifs user ${username}, ordered by ${order}`);
  }
}

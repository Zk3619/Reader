/**
 * Niconico siblings — ported from yt-dlp niconico.py
 * NiconicoIE skipped (hand-written in more-sites.ts, ie_key 'Niconico')
 */

import { ExtractorError, InfoExtractor, SearchInfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { protoRelative } from './_helpers';

const NICONICO_IE_KEY = 'Niconico';

export class NiconicoBaseIE extends InfoExtractor {
  static IE_NAME = 'NiconicoBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _API_BASE = 'https://nvapi.nicovideo.jp';
  static _BASE_URL = 'https://www.nicovideo.jp';
  static _LOGIN_BASE = 'https://account.nicovideo.jp';
  static _HEADERS = { 'X-Frontend-ID': '6', 'X-Frontend-Version': '0' };

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NiconicoBaseIE is not a standalone extractor', { expected: true });
  }

  protected get isLoggedIn(): boolean {
    return Boolean(this._get_cookies('https://www.nicovideo.jp').user_session);
  }
}

export class NiconicoPlaylistBaseIE extends InfoExtractor {
  static IE_NAME = 'NiconicoPlaylistBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _PAGE_SIZE = 100;
  static _API_HEADERS = {
    'X-Frontend-ID': '6',
    'X-Frontend-Version': '0',
    'X-Niconico-Language': 'en-us',
  };

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NiconicoPlaylistBaseIE is not a standalone extractor', { expected: true });
  }

  protected static _parseOwner(item: Record<string, unknown>): Record<string, unknown> {
    return {
      uploader:
        str_or_none(traverse_obj(item, ['owner', 'name'])) ||
        str_or_none(traverse_obj(item, ['owner', 'user', 'nickname'])) ||
        undefined,
      uploader_id: str_or_none(traverse_obj(item, ['owner', 'id'])) ?? undefined,
    };
  }

  protected async *_fetchPage(listId: string, page: number): AsyncGenerator<VideoInfo> {
    const resp = await this._callApi(listId, `page ${page + 1}`, { page: page + 1, pageSize: NiconicoPlaylistBaseIE._PAGE_SIZE });
    for (const item of (resp.items as Array<Record<string, unknown>>) || []) {
      const video = (item.video as Record<string, unknown>) || item;
      const videoId = str_or_none(video?.id);
      if (!videoId || !/^\d/.test(videoId) && !/^(sm|so|nm|nl|ss)/i.test(videoId)) continue;
      const count = (video.count as Record<string, unknown>) || {};
      yield {
        _type: 'url',
        id: videoId,
        title: str_or_none(video.title) ?? undefined,
        url: `https://www.nicovideo.jp/watch/${videoId}`,
        ie_key: NICONICO_IE_KEY,
        description: str_or_none(video.shortDescription) ?? undefined,
        duration: int_or_none(video.duration) ?? undefined,
        view_count: int_or_none(count.view) ?? undefined,
        comment_count: int_or_none(count.comment) ?? undefined,
        thumbnail: url_or_none(traverse_obj(video, ['thumbnail', 'nHdUrl'])) ||
          url_or_none(traverse_obj(video, ['thumbnail', 'largeUrl'])) ||
          undefined,
        ...NiconicoPlaylistBaseIE._parseOwner(video),
      };
    }
  }

  protected async *_entries(listId: string): AsyncGenerator<VideoInfo> {
    for (let page = 0; ; page++) {
      let count = 0;
      for await (const entry of this._fetchPage(listId, page)) {
        count++;
        yield entry;
      }
      if (count < NiconicoPlaylistBaseIE._PAGE_SIZE) break;
    }
  }

  protected async _callApi(_listId: string, _resource: string, _query: Record<string, unknown>): Promise<Record<string, unknown>> {
    throw new ExtractorError('Subclass must implement _callApi', { expected: true });
  }
}

export class NiconicoPlaylistIE extends NiconicoPlaylistBaseIE {
  static IE_NAME = 'niconico:playlist';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.|sp\.)?nicovideo\.jp|nico\.ms)\/(?:user\/\d+\/)?(?:my\/)?mylist\/(?:#\/)?(?<id>\d+)/;

  protected async _callApi(listId: string, _resource: string, query: Record<string, unknown>) {
    const resp = await this._download_json<{ data?: { mylist?: Record<string, unknown> } }>(
      `https://nvapi.nicovideo.jp/v2/mylists/${listId}`,
      listId,
      undefined,
      { query: query as Record<string, string>, headers: NiconicoPlaylistBaseIE._API_HEADERS },
    );
    return (resp.data?.mylist || {}) as Record<string, unknown>;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const listId = this._match_id(url);
    const mylist = await this._callApi(listId, 'list', { pageSize: 1 });
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(listId)) entries.push(e);
    return {
      ...this.playlist_result(
        entries,
        listId,
        str_or_none(mylist.name) ?? undefined,
        str_or_none(mylist.description) ?? undefined,
      ),
      ...NiconicoPlaylistBaseIE._parseOwner(mylist),
    };
  }
}

export class NiconicoSeriesIE extends NiconicoPlaylistBaseIE {
  static IE_NAME = 'niconico:series';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.|sp\.)?nicovideo\.jp(?:\/user\/\d+)?|nico\.ms)\/series\/(?<id>\d+)/;

  protected async _callApi(listId: string, _resource: string, query: Record<string, unknown>) {
    const resp = await this._download_json<{ data?: Record<string, unknown> }>(
      `https://nvapi.nicovideo.jp/v2/series/${listId}`,
      listId,
      undefined,
      { query: query as Record<string, string>, headers: NiconicoPlaylistBaseIE._API_HEADERS },
    );
    return resp.data || {};
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const listId = this._match_id(url);
    const data = await this._callApi(listId, 'list', { pageSize: 1 });
    const series = (data.detail as Record<string, unknown>) || {};
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(listId)) entries.push(e);
    return {
      ...this.playlist_result(
        entries,
        listId,
        str_or_none(series.title) ?? undefined,
        str_or_none(series.description) ?? undefined,
      ),
      ...NiconicoPlaylistBaseIE._parseOwner(series),
    };
  }
}

export class NiconicoHistoryIE extends NiconicoPlaylistBaseIE {
  static IE_NAME = 'niconico:history';
  static IE_DESC = 'NicoNico user history or likes. Requires cookies.';
  static _VALID_URL = /https?:\/\/(?:www\.|sp\.)?nicovideo\.jp\/my\/(?<id>history(?:\/like)?)/;

  protected async _callApi(listId: string, _resource: string, query: Record<string, unknown>) {
    const path = listId === 'history/like' ? 'likes' : 'watch/history';
    const resp = await this._download_json<{ data?: Record<string, unknown> }>(
      `https://nvapi.nicovideo.jp/v1/users/me/${path}`,
      listId,
      undefined,
      { query: query as Record<string, string>, headers: NiconicoPlaylistBaseIE._API_HEADERS },
    );
    return resp.data || {};
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const listId = this._match_id(url);
    let mylist: Record<string, unknown>;
    try {
      mylist = await this._callApi(listId, 'list', { pageSize: 1 });
    } catch (e) {
      const status = (e as { cause?: { status?: number } }).cause?.status;
      if (status === 401) {
        throw new ExtractorError('You have to be logged in to get your history', { expected: true });
      }
      throw e;
    }
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(listId)) entries.push(e);
    return { ...this.playlist_result(entries, listId), ...NiconicoPlaylistBaseIE._parseOwner(mylist) };
  }
}

export class NicovideoSearchBaseIE extends InfoExtractor {
  static IE_NAME = 'NicovideoSearchBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _SEARCH_TYPE = 'search';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NicovideoSearchBaseIE is not a standalone extractor', { expected: true });
  }

  protected async *_entriesFromUrl(
    pageUrl: string,
    itemId: string,
    query: Record<string, string> = {},
  ): AsyncGenerator<VideoInfo> {
    for (let pageNum = query.page ? Number(query.page) : 1; ; pageNum++) {
      query.page = String(pageNum);
      const webpage = await this._download_webpage(pageUrl, itemId, undefined, { query });
      const results = [...webpage.matchAll(/data-video-id=["']?([^"']+)/g)].map((m) => m[1]).filter(Boolean);
      for (const vid of results) {
        yield this.url_result(`https://www.nicovideo.jp/watch/${vid}`, NICONICO_IE_KEY, vid);
      }
      if (!results.length) break;
    }
  }
}

export class NicovideoSearchIE extends NicovideoSearchBaseIE {
  static IE_NAME = 'nicovideo:search';
  static IE_DESC = 'Nico video search';
  static _SEARCH_KEY = 'nicosearch';

  protected async _get_n_results(query: string, n: number): Promise<VideoInfo[]> {
    const entries: VideoInfo[] = [];
    const base = protoRelative(`//www.nicovideo.jp/search/${encodeURIComponent(query)}`);
    for await (const e of this._entriesFromUrl(base, query)) {
      entries.push(e);
      if (entries.length >= n) break;
    }
    return entries;
  }

  async _real_extract(query: string): Promise<VideoInfo> {
    const q = query.includes(':') ? query.split(':').slice(1).join(':') : query;
    const entries = await this._get_n_results(q, 10);
    return this.playlist_result(entries, q, q);
  }
}

export class NicovideoSearchURLIE extends NicovideoSearchBaseIE {
  static IE_NAME = 'nicovideo:search_url';
  static IE_DESC = 'Nico video search URLs';
  static _VALID_URL = /https?:\/\/(?:www\.)?nicovideo\.jp\/search\/(?<id>[^?#&]+)?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const query = this._match_id(url);
    const entries: VideoInfo[] = [];
    const u = new URL(url);
    const qs: Record<string, string> = {};
    u.searchParams.forEach((v, k) => {
      qs[k] = v;
    });
    for await (const e of this._entriesFromUrl(url.split('?')[0]!, query, qs)) entries.push(e);
    return this.playlist_result(entries, query, query);
  }
}

export class NicovideoSearchDateIE extends SearchInfoExtractor {
  static IE_NAME = 'nicovideo:search:date';
  static IE_DESC = 'Nico video search, newest first';
  static _SEARCH_KEY = 'nicosearchdate';
  static _RESULTS_PER_PAGE = 32;

  protected async _get_n_results(query: string, n: number): Promise<VideoInfo[]> {
    const entries: VideoInfo[] = [];
    const base = `https://www.nicovideo.jp/search/${encodeURIComponent(query)}`;
    for (let page = 1; entries.length < n && page <= 50; page++) {
      const webpage = await this._download_webpage(base, query, undefined, {
        query: { sort: 'f', order: 'd', page: String(page) },
      });
      const results = [...webpage.matchAll(/data-video-id=["']?([^"']+)/g)].map((m) => m[1]).filter(Boolean);
      for (const vid of results) {
        entries.push(this.url_result(`https://www.nicovideo.jp/watch/${vid}`, NICONICO_IE_KEY, vid));
        if (entries.length >= n) break;
      }
      if (results.length < NicovideoSearchDateIE._RESULTS_PER_PAGE) break;
    }
    return entries;
  }
}

export class NicovideoTagURLIE extends NicovideoSearchBaseIE {
  static IE_NAME = 'niconico:tag';
  static IE_DESC = 'NicoNico video tag URLs';
  static _SEARCH_TYPE = 'tag';
  static _VALID_URL = /https?:\/\/(?:www\.)?nicovideo\.jp\/tag\/(?<id>[^?#&]+)?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const query = decodeURIComponent(this._match_id(url));
    const entries: VideoInfo[] = [];
    for await (const e of this._entriesFromUrl(`https://www.nicovideo.jp/tag/${encodeURIComponent(query)}`, query)) {
      entries.push(e);
    }
    return this.playlist_result(entries, query, query);
  }
}

export class NiconicoUserIE extends InfoExtractor {
  static IE_NAME = 'NiconicoUser';
  static _VALID_URL = /https?:\/\/(?:www\.)?nicovideo\.jp\/user\/(?<id>\d+)(?:\/video)?\/?(?:$|[#?])/;
  static _PAGE_SIZE = 100;
  static _API_HEADERS = { 'X-Frontend-ID': '6', 'X-Frontend-Version': '0' };

  protected async *_entries(listId: string): AsyncGenerator<VideoInfo> {
    let totalCount = 1;
    let count = 0;
    for (let pageNum = 0; count < totalCount; pageNum++) {
      const resp = await this._download_json<{ data?: Record<string, unknown> }>(
        `https://nvapi.nicovideo.jp/v2/users/${listId}/videos?sortKey=registeredAt&sortOrder=desc&pageSize=${NiconicoUserIE._PAGE_SIZE}&page=${pageNum + 1}`,
        listId,
        pageNum ? `Downloading JSON metadata page ${pageNum}` : 'Downloading JSON metadata',
        { headers: NiconicoUserIE._API_HEADERS },
      );
      if (!pageNum) totalCount = int_or_none(resp.data?.totalCount) || 0;
      for (const entry of (resp.data?.items as Array<Record<string, unknown>>) || []) {
        count++;
        const essential = (entry.essential as Record<string, unknown>) || {};
        yield this.url_result(
          `https://www.nicovideo.jp/watch/${essential.id}`,
          NICONICO_IE_KEY,
          str_or_none(essential.id) ?? undefined,
        );
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const listId = this._match_id(url);
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(listId)) entries.push(e);
    return this.playlist_result(entries, listId);
  }
}

export class NiconicoLiveIE extends NiconicoBaseIE {
  static IE_NAME = 'niconico:live';
  static IE_DESC = 'ニコニコ生放送';
  static _VALID_URL = /https?:\/\/(?:sp\.)?live2?\.nicovideo\.jp\/(?:watch|gate)\/(?<id>lv\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const errMsg = webpage.match(/class="message"[^>]*>([\s\S]*?)<\//i)?.[1]?.replace(/<[^>]+>/g, '').trim();
    if (errMsg) throw new ExtractorError(errMsg, { expected: true });

    const propsMatch = webpage.match(/id="embedded-data"[^>]*data-props="([^"]+)"/);
    if (!propsMatch) throw new ExtractorError('Unable to extract live stream data', { expected: true });
    const embeddedData = this._parse_json<Record<string, unknown>>(
      propsMatch[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
      videoId,
    );

    // Simplified: skip WebSocket handshake; look for m3u8 in embedded data or page
    const m3u8Match =
      webpage.match(/"(https:[^"]+\.m3u8[^"]*)"/) ||
      webpage.match(/(https:[^"']+\.m3u8[^"']*)/);
    if (!m3u8Match) {
      throw new ExtractorError('Live stream requires WebSocket protocol (niconico_live); not fully ported', {
        expected: true,
      });
    }

    const formats = await this._extract_m3u8_formats(m3u8Match[1]!, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, true);
    for (const f of formats) f.protocol = 'm3u8_native';

    return {
      id: videoId,
      title:
        str_or_none(traverse_obj(embeddedData, ['program', 'title'])) ||
        this._html_search_meta(['og:title', 'twitter:title'], webpage) ||
        videoId,
      is_live: true,
      formats,
      view_count: int_or_none(traverse_obj(embeddedData, ['program', 'statistics', 'watchCount'])) ?? undefined,
      comment_count: int_or_none(traverse_obj(embeddedData, ['program', 'statistics', 'commentCount'])) ?? undefined,
      uploader: str_or_none(traverse_obj(embeddedData, ['program', 'supplier', 'name'])) ?? undefined,
      channel: str_or_none(traverse_obj(embeddedData, ['socialGroup', 'name'])) ?? undefined,
      channel_id: str_or_none(traverse_obj(embeddedData, ['socialGroup', 'id'])) ?? undefined,
      timestamp: int_or_none(traverse_obj(embeddedData, ['program', 'openTime'])) ?? undefined,
    };
  }
}

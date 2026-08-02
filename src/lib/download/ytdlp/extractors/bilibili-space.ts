/**
 * Bilibili space (个人空间) family — aligned with bilibili.py
 * BilibiliSpaceBaseIE / BilibiliSpaceListBaseIE and their concrete subclasses.
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { VideoInfo } from '../types';
import {
  BILI_HEADERS,
  ensureBiliSession,
  extractJsonAssign,
  getBiliCookieValue,
  signBiliWbiUrl,
} from './bilibili-shared';
import { BilibiliBaseIE } from './bilibili-base';

function buildPlaylistResult(
  ie: InfoExtractor,
  entries: VideoInfo[],
  id: string,
  extra: Partial<VideoInfo> = {},
): VideoInfo {
  return {
    _type: 'playlist',
    id,
    title: id,
    entries,
    playlist_count: entries.length,
    extractor: ie.IE_NAME,
    extractor_key: ie.ie_key,
    ...extra,
  };
}

/** Shared eager pagination helper (mirrors upstream's InAdvancePagedList usage). */
export class BilibiliSpaceBaseIE extends BilibiliBaseIE {
  static IE_NAME = 'bilibilispacebase';

  protected async extractAllPages(
    fetchPage: (pageIdx: number) => Promise<Record<string, unknown>>,
    getPageCount: (first: Record<string, unknown>) => number,
    getEntries: (page: Record<string, unknown>) => VideoInfo[],
  ): Promise<VideoInfo[]> {
    const first = await fetchPage(0);
    const pageCount = Math.max(1, Math.min(getPageCount(first) || 1, 500));
    const entries = [...getEntries(first)];
    for (let i = 1; i < pageCount; i++) {
      const page = await fetchPage(i);
      entries.push(...getEntries(page));
    }
    return entries;
  }
}

export class BilibiliSpaceListBaseIE extends BilibiliSpaceBaseIE {
  static IE_NAME = 'bilibilispacelistbase';

  protected getEntriesFromList(
    list: Array<Record<string, unknown>>,
    endingKey = 'bvid',
  ): VideoInfo[] {
    return list
      .map((item) => String(item[endingKey] || ''))
      .filter(Boolean)
      .map((bvid) => this.url_result(`https://www.bilibili.com/video/${bvid}`, 'BiliBili', bvid));
  }

  protected async getUploaderName(uid: string, playlistId: string): Promise<string | null> {
    const webpage = await this._download_webpage(
      `https://space.bilibili.com/${uid}`,
      playlistId,
      undefined,
      { headers: BILI_HEADERS, fatal: false },
    );
    const m = webpage?.match(/<title\b[^>]*>([^<]+)的个人空间-/);
    return m?.[1] || null;
  }
}

/** /(id)/video — user's uploaded videos (or hidden-mode collections). */
export class BilibiliSpaceVideoIE extends BilibiliSpaceBaseIE {
  static IE_NAME = 'BilibiliSpaceVideo';
  static _VALID_URL =
    /https?:\/\/space\.bilibili\.com\/(?<id>\d+)(?<video>(?:\/upload)?\/video)?\/?(?:[?#]|$)/i;
  static _TESTS = [{ url: 'https://space.bilibili.com/3985676/video', only_matching: true }];

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playlistId = m.groups?.id || '';
    const isVideoUrl = Boolean(m.groups?.video);
    if (!isVideoUrl) {
      this.to_screen(
        "A channel URL was given. Only the channel's videos will be downloaded. " +
          'To download audios, add a "/upload/audio" to the URL',
      );
    }
    const order = new URL(url).searchParams.get('order') || 'pubdate';

    const fetchPage = async (pageIdx: number): Promise<Record<string, unknown>> => {
      const signedUrl = await signBiliWbiUrl('https://api.bilibili.com/x/space/wbi/arc/search', {
        keyword: '',
        mid: playlistId,
        order,
        order_avoided: 'true',
        platform: 'web',
        pn: pageIdx + 1,
        ps: 30,
        tid: 0,
        web_location: '333.1387',
        special_type: '',
        index: 0,
      });
      const resp = await this._download_json<Record<string, unknown>>(
        signedUrl,
        playlistId,
        `Downloading space page ${pageIdx}`,
        {
          headers: { ...BILI_HEADERS, Referer: url, Origin: 'https://space.bilibili.com' },
          fatal: false,
        },
      );
      const code = Number(resp.code);
      if (code === -401) {
        throw new ExtractorError('Request is blocked by server (401), please wait and try later.', {
          expected: true,
        });
      }
      if (code === -352) {
        throw new ExtractorError('Request is rejected by server (352)', { expected: true });
      }
      if (code !== 0) {
        throw new ExtractorError(`Request failed (${code}): ${resp.message || 'Unknown error'}`);
      }
      return (resp.data as Record<string, unknown>) || {};
    };

    const getPageCount = (page: Record<string, unknown>): number => {
      const pg = (page.page || {}) as { ps?: number; count?: number };
      const size = Number(pg.ps) || 30;
      const count = Number(pg.count) || 0;
      return Math.ceil(count / size);
    };

    const getEntries = (page: Record<string, unknown>): VideoInfo[] => {
      const list =
        ((page.list as Record<string, unknown>)?.vlist as Array<Record<string, unknown>>) || [];
      return list.map((entry) => {
        const meta = (entry.meta || {}) as { attribute?: number; id?: number };
        if (meta.attribute === 156) {
          return this.url_result(
            `https://space.bilibili.com/${entry.mid}/lists/${meta.id}?type=season`,
            'BilibiliCollectionList',
            `${entry.mid}_${meta.id}`,
          );
        }
        return this.url_result(
          `https://www.bilibili.com/video/${entry.bvid}`,
          'BiliBili',
          String(entry.bvid || ''),
        );
      });
    };

    const entries = await this.extractAllPages(fetchPage, getPageCount, getEntries);
    return this.playlist_result(entries, playlistId);
  }
}

/** /(id)/audio — user's uploaded songs. */
export class BilibiliSpaceAudioIE extends BilibiliSpaceBaseIE {
  static IE_NAME = 'BilibiliSpaceAudio';
  static _VALID_URL = /https?:\/\/space\.bilibili\.com\/(?<id>\d+)\/(?:upload\/)?audio/i;
  static _TESTS = [
    { url: 'https://space.bilibili.com/313580179/upload/audio', only_matching: true },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    void url;
    const playlistId = this._match_id(url);

    const fetchPage = async (pageIdx: number): Promise<Record<string, unknown>> => {
      const resp = await this._download_json<Record<string, unknown>>(
        'https://api.bilibili.com/audio/music-service/web/song/upper',
        playlistId,
        `Downloading page ${pageIdx}`,
        {
          headers: BILI_HEADERS,
          fatal: false,
          query: {
            uid: playlistId,
            pn: String(pageIdx + 1),
            ps: '30',
            order: '1',
            jsonp: 'jsonp',
          },
        },
      );
      return (resp.data as Record<string, unknown>) || {};
    };

    const getPageCount = (page: Record<string, unknown>): number =>
      Math.ceil((Number(page.pageCount) || 1));

    const getEntries = (page: Record<string, unknown>): VideoInfo[] => {
      const list = (page.data as Array<Record<string, unknown>>) || [];
      return list.map((e) =>
        this.url_result(
          `https://www.bilibili.com/audio/au${e.id}`,
          'BilibiliAudio',
          String(e.id || ''),
        ),
      );
    };

    const entries = await this.extractAllPages(fetchPage, getPageCount, getEntries);
    return this.playlist_result(entries, playlistId);
  }
}

/** /(mid)/channel/collectiondetail?sid= or /(mid)/lists/(sid) — 合集. */
export class BilibiliCollectionListIE extends BilibiliSpaceListBaseIE {
  static IE_NAME = 'BilibiliCollectionList';
  static _VALID_URL = [
    /https?:\/\/space\.bilibili\.com\/(?<mid>\d+)\/channel\/collectiondetail\/?\?sid=(?<sid>\d+)/i,
    /https?:\/\/space\.bilibili\.com\/(?<mid>\d+)\/lists\/(?<sid>\d+)/i,
  ];
  static _TESTS = [
    { url: 'https://space.bilibili.com/2142762/lists/3662502?type=season', only_matching: true },
  ];

  static suitable(url: string): boolean {
    if (BilibiliSeriesListIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const mid = m.groups?.mid || '';
    const sid = m.groups?.sid || '';
    const playlistId = `${mid}_${sid}`;

    const fetchPage = async (pageIdx: number): Promise<Record<string, unknown>> => {
      const resp = await this._download_json<Record<string, unknown>>(
        'https://api.bilibili.com/x/polymer/web-space/seasons_archives_list',
        playlistId,
        `Downloading page ${pageIdx}`,
        {
          headers: { ...BILI_HEADERS, Referer: url },
          fatal: false,
          query: { mid, season_id: sid, page_num: String(pageIdx + 1), page_size: '30' },
        },
      );
      return (resp.data as Record<string, unknown>) || {};
    };

    const first = await fetchPage(0);
    const page = (first.page || {}) as { page_size?: number; total?: number };
    const size = Number(page.page_size) || 30;
    const count = Number(page.total) || 0;
    const pageCount = Math.max(1, Math.min(Math.ceil(count / size) || 1, 500));
    const meta = (first.meta || {}) as Record<string, unknown>;

    const entries = this.getEntriesFromList(
      (first.archives as Array<Record<string, unknown>>) || [],
    );
    for (let i = 1; i < pageCount; i++) {
      const p = await fetchPage(i);
      entries.push(...this.getEntriesFromList((p.archives as Array<Record<string, unknown>>) || []));
    }

    const uploader = await this.getUploaderName(mid, playlistId);
    return buildPlaylistResult(this, entries, playlistId, {
      title: String(meta.name || playlistId),
      description: String(meta.description || '') || null,
      uploader,
      uploader_id: meta.mid != null ? String(meta.mid) : mid,
      timestamp: Number(meta.ptime) || null,
      thumbnail: String(meta.cover || '') || null,
    });
  }
}

/** /(mid)/channel/seriesdetail?sid= or /(mid)/lists/(sid)?type=series — 系列. */
export class BilibiliSeriesListIE extends BilibiliSpaceListBaseIE {
  static IE_NAME = 'BilibiliSeriesList';
  static _VALID_URL = [
    /https?:\/\/space\.bilibili\.com\/(?<mid>\d+)\/channel\/seriesdetail\/?\?\bsid=(?<sid>\d+)/i,
    /https?:\/\/space\.bilibili\.com\/(?<mid>\d+)\/lists\/(?<sid>\d+)\/?\?(?:[^#]+&)?type=series(?:[&#]|$)/i,
  ];
  static _TESTS = [
    { url: 'https://space.bilibili.com/1958703906/lists/547718?type=series', only_matching: true },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const mid = m.groups?.mid || '';
    const sid = m.groups?.sid || '';
    const playlistId = `${mid}_${sid}`;

    const metaResp = await this._download_json<Record<string, unknown>>(
      `https://api.bilibili.com/x/series/series?series_id=${sid}`,
      playlistId,
      undefined,
      { headers: BILI_HEADERS, fatal: false },
    );
    const meta = ((metaResp.data as Record<string, unknown>)?.meta || {}) as Record<
      string,
      unknown
    >;

    const fetchPage = async (pageIdx: number): Promise<Record<string, unknown>> => {
      const resp = await this._download_json<Record<string, unknown>>(
        'https://api.bilibili.com/x/series/archives',
        playlistId,
        `Downloading page ${pageIdx}`,
        {
          headers: { ...BILI_HEADERS, Referer: url },
          fatal: false,
          query: { mid, series_id: sid, pn: String(pageIdx + 1), ps: '30' },
        },
      );
      return (resp.data as Record<string, unknown>) || {};
    };

    const first = await fetchPage(0);
    const page = (first.page || {}) as { size?: number; total?: number };
    const size = Number(page.size) || 30;
    const count = Number(page.total) || 0;
    const pageCount = Math.max(1, Math.min(Math.ceil(count / size) || 1, 500));

    const entries = this.getEntriesFromList(
      (first.archives as Array<Record<string, unknown>>) || [],
    );
    for (let i = 1; i < pageCount; i++) {
      const p = await fetchPage(i);
      entries.push(...this.getEntriesFromList((p.archives as Array<Record<string, unknown>>) || []));
    }

    const uploader = await this.getUploaderName(mid, playlistId);
    return buildPlaylistResult(this, entries, playlistId, {
      title: String(meta.name || playlistId),
      description: String(meta.description || '') || null,
      uploader,
      uploader_id: meta.mid != null ? String(meta.mid) : mid,
      timestamp: Number(meta.ctime) || null,
      modified_timestamp: Number(meta.mtime) || null,
    });
  }
}

/** /favlist?fid= or /medialist/detail/ml(id) — 收藏夹. */
export class BilibiliFavoritesListIE extends BilibiliSpaceListBaseIE {
  static IE_NAME = 'BilibiliFavoritesList';
  static _VALID_URL =
    /https?:\/\/(?:space\.bilibili\.com\/\d+\/favlist\/?\?fid=|(?:www\.)?bilibili\.com\/medialist\/detail\/ml)(?<id>\d+)/i;
  static _TESTS = [
    {
      url: 'https://space.bilibili.com/84912/favlist?fid=1103407912&ftype=create',
      only_matching: true,
    },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    void url;
    const fid = this._match_id(url);

    const listInfo = await this._download_json<Record<string, unknown>>(
      `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${fid}&pn=1&ps=20`,
      fid,
      'Downloading favlist metadata',
      { headers: BILI_HEADERS, fatal: false },
    );
    if (Number(listInfo.code) === -403) {
      this.raise_login_required('This is a private favorites list. You need to log in as its owner');
    }

    const idsResp = await this._download_json<Record<string, unknown>>(
      `https://api.bilibili.com/x/v3/fav/resource/ids?media_id=${fid}`,
      fid,
      'Download favlist entries',
      { headers: BILI_HEADERS, fatal: false },
    );
    const entries = this.getEntriesFromList(
      (idsResp.data as Array<Record<string, unknown>>) || [],
    );

    const info = ((listInfo.data as Record<string, unknown>)?.info || {}) as Record<
      string,
      unknown
    >;
    const upper = (info.upper || {}) as Record<string, unknown>;
    const cntInfo = (info.cnt_info || {}) as Record<string, unknown>;
    return buildPlaylistResult(this, entries, fid, {
      title: String(info.title || fid),
      description: String(info.intro || '') || null,
      uploader: String(upper.name || '') || null,
      uploader_id: upper.mid != null ? String(upper.mid) : null,
      timestamp: Number(info.ctime) || null,
      modified_timestamp: Number(info.mtime) || null,
      thumbnail: String(info.cover || '') || null,
      view_count: Number(cntInfo.play) || null,
      like_count: Number(cntInfo.thumb_up) || null,
    });
  }
}

/** /watchlater — 稍后再看 (requires login). */
export class BilibiliWatchlaterIE extends BilibiliSpaceListBaseIE {
  static IE_NAME = 'BilibiliWatchlater';
  static _VALID_URL = /https?:\/\/(?:www\.)?bilibili\.com\/watchlater\/?(?:[?#]|$)/i;
  static _TESTS = [{ url: 'https://www.bilibili.com/watchlater/#/list', only_matching: true }];

  async _real_extract(url: string): Promise<VideoInfo> {
    void url;
    const cookie = await ensureBiliSession();
    const listId = getBiliCookieValue(cookie, 'DedeUserID') || 'watchlater';

    const info = await this._download_json<Record<string, unknown>>(
      'https://api.bilibili.com/x/v2/history/toview/web?jsonp=jsonp',
      listId,
      undefined,
      { headers: { ...BILI_HEADERS, ...(cookie ? { Cookie: cookie } : {}) }, fatal: false },
    );
    if (Number(info.code) === -101) {
      this.raise_login_required('You need to login to access your watchlater list');
    }
    const list = ((info.data as Record<string, unknown>)?.list as Array<Record<string, unknown>>) || [];
    const entries = this.getEntriesFromList(list);
    return buildPlaylistResult(this, entries, listId, { title: '稍后再看' });
  }
}

/** /(medialist/play|list)/(id) — generic playlist/medialist resolver. */
export class BilibiliPlaylistIE extends BilibiliSpaceListBaseIE {
  static IE_NAME = 'BilibiliPlaylist';
  static _VALID_URL = /https?:\/\/(?:www\.)?bilibili\.com\/(?:medialist\/play|list)\/(?<id>\w+)/i;
  static _TESTS = [
    { url: 'https://www.bilibili.com/list/1958703906?sid=547718', only_matching: true },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const listId = this._match_id(url);
    const bvid = new URL(url).searchParams.get('bvid');
    const noplaylist = Boolean(this.params.noplaylist);
    if (noplaylist && bvid) {
      return this.url_result(`https://www.bilibili.com/video/${bvid}`, 'BiliBili');
    }

    const webpage = await this._download_webpage(url, listId, 'Downloading playlist webpage', {
      headers: BILI_HEADERS,
      fatal: false,
    });
    const initialState =
      extractJsonAssign(webpage || '', /window\.__INITIAL_STATE__\s*=/) || {};

    const error = ((initialState.error || initialState.listError || {}) as Record<
      string,
      unknown
    >) || {};
    const code = Number(error.code);
    if (Object.keys(error).length && code !== 200) {
      const errorCode = Number(error.trueCode);
      if (errorCode === -400 && listId === 'watchlater') {
        this.raise_login_required('You need to login to access your watchlater playlist');
      }
      if (errorCode === -403) {
        this.raise_login_required('This is a private playlist. You need to login as its owner');
      }
      if (errorCode === 11010) {
        throw new ExtractorError('Playlist is no longer available', { expected: true });
      }
      throw new ExtractorError(`Could not access playlist: ${errorCode} ${error.message || ''}`);
    }

    const playlistMeta = (initialState.playlist || {}) as Record<string, unknown>;
    const type = Number(playlistMeta.type) || 0;
    const bizId = Number(playlistMeta.id) || 0;
    const tid = Number(initialState.tid) || 0;
    const sortField = initialState.sortFiled;
    const desc = initialState.desc;

    const baseQuery: Record<string, string> = {
      ps: '20',
      with_current: 'false',
      type: String(type),
      biz_id: String(bizId),
      tid: String(tid),
      ...(sortField != null ? { sort_field: String(sortField) } : {}),
      ...(desc != null ? { desc: String(Boolean(desc)).toLowerCase() } : {}),
    };

    const entries: VideoInfo[] = [];
    let oid: string | undefined;
    for (let page = 1; page <= 500; page++) {
      const resp = await this._download_json<Record<string, unknown>>(
        'https://api.bilibili.com/x/v2/medialist/resource/list',
        listId,
        `getting playlist ${bizId} page ${page}`,
        {
          headers: BILI_HEADERS,
          fatal: false,
          query: { ...baseQuery, ...(oid ? { oid } : {}) },
        },
      );
      const data = (resp.data as Record<string, unknown>) || {};
      const mediaList = (data.media_list as Array<Record<string, unknown>>) || [];
      entries.push(...this.getEntriesFromList(mediaList, 'bv_id'));
      oid = mediaList.length ? String(mediaList[mediaList.length - 1]!.id) : undefined;
      if (!data.has_more) break;
    }

    const mediaListInfo = (initialState.mediaListInfo || {}) as Record<string, unknown>;
    const upper = (mediaListInfo.upper || {}) as Record<string, unknown>;
    return buildPlaylistResult(this, entries, `${type}_${bizId}`, {
      title: String(mediaListInfo.title || `${type}_${bizId}`),
      uploader: String(upper.name || '') || null,
      uploader_id: upper.mid != null ? String(upper.mid) : null,
      timestamp: Number(mediaListInfo.ctime) || null,
      thumbnail: String(mediaListInfo.cover || '') || null,
    });
  }
}

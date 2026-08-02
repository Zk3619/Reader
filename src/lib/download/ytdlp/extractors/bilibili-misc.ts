/**
 * Miscellaneous Bilibili IEs — aligned with bilibili.py
 * BilibiliCategoryIE / BiliBiliSearchIE / BiliBiliPlayerIE / BiliBiliDynamicIE.
 */

import { InfoExtractor, SearchInfoExtractor, ExtractorError } from '../common';
import type { VideoInfo } from '../types';
import { BILI_HEADERS } from './bilibili-shared';

const CATEGORY_RID_MAP: Record<string, Record<string, number>> = {
  kichiku: { mad: 26, manual_vocaloid: 126, guide: 22, theatre: 216, course: 127 },
};

export class BilibiliCategoryIE extends InfoExtractor {
  static IE_NAME = 'Bilibili category extractor';
  static _VALID_URL = /https?:\/\/(?:www\.)?bilibili\.com\/v\/[a-zA-Z]+\/[a-zA-Z]+/i;
  static _TESTS = [{ url: 'https://www.bilibili.com/v/kichiku/mad', only_matching: true }];

  async _real_extract(url: string): Promise<VideoInfo> {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const category = parts[1] || '';
    const subcategory = parts[2] || '';
    const query = `${category}: ${subcategory}`;
    const rid = CATEGORY_RID_MAP[category]?.[subcategory];
    if (rid == null) {
      throw new ExtractorError(
        `The category ${category}/${subcategory} isn't supported`,
        { expected: true },
      );
    }

    const apiUrl = `https://api.bilibili.com/x/web-interface/newlist?rid=${rid}&type=1&ps=20&jsonp=jsonp`;
    const firstPage = await this._download_json<Record<string, unknown>>(
      apiUrl,
      query,
      undefined,
      { query: { Search_key: query, pn: '1' }, headers: BILI_HEADERS, fatal: false },
    );
    const pageInfo = ((firstPage.data as Record<string, unknown>)?.page || {}) as {
      count?: number;
      size?: number;
    };
    const count = Number(pageInfo.count) || 0;
    const size = Number(pageInfo.size) || 0;
    if (!size) {
      throw new ExtractorError('Failed to calculate either page count or size', {
        expected: true,
      });
    }
    const numPages = Math.max(1, Math.min(Math.ceil(count / size), 5000));

    const entries: VideoInfo[] = [];
    for (let p = 1; p <= numPages; p++) {
      const pageJson =
        p === 1
          ? firstPage
          : await this._download_json<Record<string, unknown>>(
              apiUrl,
              query,
              `Extracting results from page ${p} of ${numPages}`,
              { query: { Search_key: query, pn: String(p) }, headers: BILI_HEADERS, fatal: false },
            );
      const list = ((pageJson.data as Record<string, unknown>)?.archives as Array<
        Record<string, unknown>
      >) || [];
      for (const v of list) {
        entries.push(
          this.url_result(
            `https://www.bilibili.com/video/${v.bvid}`,
            'BiliBili',
            String(v.bvid || ''),
          ),
        );
      }
    }

    return this.playlist_result(entries, query, query);
  }
}

export class BiliBiliSearchIE extends SearchInfoExtractor {
  static IE_NAME = 'BiliBiliSearch';
  static IE_DESC = 'Bilibili video search';
  static _SEARCH_KEY = 'bilisearch';
  static _MAX_RESULTS = 100000;

  protected async _get_n_results(query: string, n: number): Promise<VideoInfo[]> {
    const entries: VideoInfo[] = [];
    for (let page = 1; entries.length < n && page <= 50; page++) {
      const resp = await this._download_json<Record<string, unknown>>(
        'https://api.bilibili.com/x/web-interface/search/type',
        query,
        `Extracting results from page ${page}`,
        {
          headers: BILI_HEADERS,
          fatal: false,
          query: {
            Search_key: query,
            keyword: query,
            page: String(page),
            context: '',
            duration: '0',
            tids_2: '',
            __refresh__: 'true',
            search_type: 'video',
            tids: '0',
            highlight: '1',
          },
        },
      );
      const videos =
        ((resp.data as Record<string, unknown>)?.result as Array<Record<string, unknown>>) || [];
      if (!videos.length) break;
      for (const v of videos) {
        entries.push(this.url_result(String(v.arcurl || ''), 'BiliBili', String(v.aid || '')));
        if (entries.length >= n) break;
      }
    }
    return entries;
  }
}

export class BiliBiliPlayerIE extends InfoExtractor {
  static IE_NAME = 'BiliBiliPlayer';
  static _VALID_URL = /https?:\/\/player\.bilibili\.com\/player\.html\?.*?\baid=(?<id>\d+)/i;
  static _TESTS = [
    {
      url: 'http://player.bilibili.com/player.html?aid=92494333&cid=157926707&page=1',
      only_matching: true,
    },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    return this.url_result(`http://www.bilibili.tv/video/av${id}/`, 'BiliBili', id);
  }
}

export class BiliBiliDynamicIE extends InfoExtractor {
  static IE_NAME = 'BiliBiliDynamic';
  static _VALID_URL =
    /https?:\/\/(?:t\.bilibili\.com|(?:www\.)?bilibili\.com\/opus)\/(?<id>\d+)/i;
  static _TESTS = [{ url: 'https://t.bilibili.com/998134289197432852', only_matching: true }];

  async _real_extract(url: string): Promise<VideoInfo> {
    const postId = this._match_id(url);
    const resp = await this._download_json<Record<string, unknown>>(
      'https://api.bilibili.com/x/polymer/web-dynamic/v1/detail',
      postId,
      undefined,
      { query: { id: postId }, headers: BILI_HEADERS, fatal: false },
    );
    const item = ((resp.data as Record<string, unknown>)?.item || {}) as Record<string, unknown>;
    const modules =
      ((item.modules as Record<string, unknown>) ||
        ((item.orig as Record<string, unknown>)?.modules as Record<string, unknown>) ||
        {}) as Record<string, unknown>;
    const moduleDynamic = (modules.module_dynamic || {}) as Record<string, unknown>;
    const major = (moduleDynamic.major || {}) as Record<string, unknown>;
    const additional = (moduleDynamic.additional || {}) as Record<string, unknown>;

    let jumpUrl =
      String((major.archive as Record<string, unknown>)?.jump_url || '') ||
      String((major.pgc as Record<string, unknown>)?.jump_url || '') ||
      String((additional.reserve as Record<string, unknown>)?.jump_url || '') ||
      String((additional.common as Record<string, unknown>)?.jump_url || '');
    if (jumpUrl.startsWith('//')) jumpUrl = `https:${jumpUrl}`;
    if (!jumpUrl) {
      throw new ExtractorError('No valid video URL found', { expected: true });
    }
    return this.url_result(jumpUrl);
  }
}

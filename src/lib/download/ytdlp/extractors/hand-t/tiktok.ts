/**
 * TikTok sibling IEs — ported from yt-dlp tiktok.py
 * TikTokIE / DouyinIE remain in ../tiktok.ts
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { TikTokIE } from '../tiktok';
import { UserNotLive } from './_helpers';

const WEB_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://www.tiktok.com/',
};

function protoRelative(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url;
}

function parseUrlKey(urlKey: string): Partial<Format> {
  const m = /v[^_]+_(?<codec>[^_]+)_(?<res>\d+p)_(?<bitrate>\d+)/.exec(urlKey);
  if (!m?.groups) return {};
  const res = m.groups.res;
  const height = Number(res.replace(/\D/g, '')) || undefined;
  const codec = m.groups.codec;
  return {
    format_id: `${codec}_${res}_${m.groups.bitrate}`,
    vcodec: codec === 'bytevc1' ? 'h265' : codec,
    tbr: Number(m.groups.bitrate) || undefined,
    height: height === 540 ? 576 : height,
    preference: codec === 'bytevc2' ? -100 : -1,
    format_note: codec === 'bytevc2' ? 'UNPLAYABLE' : undefined,
  };
}

function extractUniversalData(webpage: string): Record<string, unknown> {
  const m = webpage.match(
    /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/,
  );
  if (!m?.[1]) return {};
  try {
    const json = JSON.parse(m[1]) as Record<string, unknown>;
    return (json.__DEFAULT_SCOPE__ as Record<string, unknown>) || {};
  } catch {
    return {};
  }
}

export class TikTokBaseIE extends InfoExtractor {
  static IE_NAME = 'tiktokbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected _UPLOADER_URL_FORMAT = 'https://www.tiktok.com/@%s';
  protected _WEBPAGE_HOST = 'https://www.tiktok.com/';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TikTokBaseIE is not a standalone extractor', { expected: true });
  }

  protected _createUrl(userId: string | null | undefined, videoId: string): string {
    return `https://www.tiktok.com/@${userId || '_'}/video/${videoId}`;
  }

  protected _extractWebFormats(awemeDetail: Record<string, unknown>): Format[] {
    const formats: Format[] = [];
    const seen = new Set<string>();
    const video = (awemeDetail.video as Record<string, unknown>) || {};
    const playWidth = int_or_none(video.width) ?? undefined;
    const playHeight = int_or_none(video.height) ?? undefined;
    const ratio = playWidth && playHeight ? playWidth / playHeight : 0.5625;

    for (const bitrateInfo of (video.bitrateInfo as Array<Record<string, unknown>>) || []) {
      const playAddr = (bitrateInfo.PlayAddr as Record<string, unknown>) || {};
      const meta = parseUrlKey(String(playAddr.UrlKey || ''));
      const urls = (playAddr.UrlList as string[]) || [];
      let width = playWidth;
      let height = playHeight;
      const dim = meta.height;
      if (dim && ratio) {
        if (ratio < 1) {
          width = dim;
          height = Math.round(dim / ratio) - (Math.round(dim / ratio) % 2);
        } else {
          width = Math.round(dim * ratio) + (Math.round(dim * ratio) % 2);
          height = dim;
        }
      }
      for (const u of urls) {
        const abs = protoRelative(u);
        if (seen.has(abs)) continue;
        seen.add(abs);
        formats.push({
          format_id: meta.format_id || `fmt-${formats.length}`,
          url: abs,
          ext: 'mp4',
          vcodec: 'h264',
          acodec: 'aac',
          http_headers: WEB_HEADERS,
          ...meta,
          width,
          height,
        });
      }
    }

    const playAddr = video.playAddr;
    if (typeof playAddr === 'string') {
      const abs = protoRelative(playAddr);
      if (!seen.has(abs)) {
        formats.push({
          format_id: 'play',
          url: abs,
          ext: 'mp4',
          width: playWidth,
          height: playHeight,
          http_headers: WEB_HEADERS,
        });
      }
    }

    return formats.filter((f) => f.url && !String(f.url).includes('www.tiktok.com'));
  }

  protected _parseAwemeVideoWeb(
    awemeDetail: Record<string, unknown>,
    webpageUrl: string,
    videoId: string,
    extractFlat = false,
  ): Partial<VideoInfo> {
    const author =
      (awemeDetail.authorInfo as Record<string, unknown>) ||
      (awemeDetail.author as Record<string, unknown>) ||
      {};
    return {
      id: videoId,
      formats: extractFlat ? undefined : this._extractWebFormats(awemeDetail),
      http_headers: { Referer: webpageUrl },
      uploader: str_or_none(author.uniqueId ?? author.author) ?? undefined,
      uploader_id: str_or_none(author.uid ?? author.id) ?? undefined,
      channel: str_or_none(author.nickname) ?? undefined,
      channel_id: str_or_none(author.secUid) ?? undefined,
      title: str_or_none(awemeDetail.desc)?.slice(0, 72) ?? undefined,
      description: str_or_none(awemeDetail.desc) ?? undefined,
      timestamp: int_or_none(awemeDetail.createTime) ?? undefined,
      view_count: int_or_none(traverse_obj(awemeDetail, ['stats', 'playCount'])) ?? undefined,
      like_count: int_or_none(traverse_obj(awemeDetail, ['stats', 'diggCount'])) ?? undefined,
      repost_count: int_or_none(traverse_obj(awemeDetail, ['stats', 'shareCount'])) ?? undefined,
      comment_count: int_or_none(traverse_obj(awemeDetail, ['stats', 'commentCount'])) ?? undefined,
    };
  }
}

export class TikTokUserIE extends TikTokBaseIE {
  static IE_NAME = 'tiktok:user';
  static _VALID_URL =
    /(?:tiktokuser:|https?:\/\/(?:www\.)?tiktok\.com\/@)(?<id>[\w.-]+)\/?(?:$|[#?])/;

  protected async *_entries(
    secUid: string,
    userName: string | null,
    failEarly: boolean,
  ): AsyncGenerator<VideoInfo> {
    const displayId = userName || secUid;
    const seen = new Set<string>();
    let cursor = Date.now();

    for (let page = 1; page < 500; page++) {
      const response = await this._download_json<Record<string, unknown>>(
        'https://www.tiktok.com/api/creator/item_list/',
        displayId,
        `Downloading page ${page}`,
        {
          query: {
            aid: '1988',
            count: '15',
            cursor: String(cursor),
            device_id: String(Math.floor(Math.random() * 1e18)),
            secUid,
            type: '1',
          },
          headers: WEB_HEADERS,
        },
      );

      for (const video of (response.itemList as Array<Record<string, unknown>>) || []) {
        const videoId = String(video.id);
        if (seen.has(videoId)) continue;
        seen.add(videoId);
        yield this.url_result(this._createUrl(displayId, videoId), 'TikTok', videoId);
      }

      const last = (response.itemList as Array<Record<string, unknown>>)?.slice(-1)[0];
      const oldCursor = cursor;
      cursor = last?.createTime ? Number(last.createTime) * 1000 : oldCursor - 7 * 86400000;
      if (cursor < 1472706000000 || !response.hasMorePrevious) return;
      if (failEarly && !seen.size) {
        this.raise_login_required(
          "This user's account is likely private; log into an account that has access",
        );
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    let userName = this._match_id(url);
    let secUid: string | null = null;
    let failEarly = false;

    if (/^MS4wLjABAAAA[\w-]{64}$/.test(userName)) {
      secUid = userName;
      userName = '';
      failEarly = true;
    } else {
      const webpage = await this._download_webpage(
        this._UPLOADER_URL_FORMAT.replace('%s', userName),
        userName,
        undefined,
        { headers: WEB_HEADERS, fatal: false },
      );
      const detail =
        (traverse_obj(extractUniversalData(webpage || ''), ['webapp.user-detail']) as Record<
          string,
          unknown
        >) || {};
      if (int_or_none(traverse_obj(detail, ['userInfo', 'stats', 'videoCount'])) === 0 && detail.statusCode === 10222) {
        this.raise_login_required('This user\'s account is private');
      }
      secUid = str_or_none(traverse_obj(detail, ['userInfo', 'user', 'secUid']));
      failEarly = !traverse_obj(detail, ['userInfo', 'itemList']);
    }

    if (!secUid) {
      throw new ExtractorError('Unable to extract secondary user ID; try tiktokuser:sec_uid', {
        expected: true,
      });
    }

    const entries: VideoInfo[] = [];
    for await (const e of this._entries(secUid, userName || null, failEarly)) entries.push(e);
    return this.playlist_result(entries, secUid, userName || secUid);
  }
}

export class TikTokBaseListIE extends TikTokBaseIE {
  static IE_NAME = 'tiktokbaselist';
  protected _QUERY_NAME = 'music_id';
  protected _API_ENDPOINT = 'music/aweme';

  protected async *_entries(listId: string, displayId: string): AsyncGenerator<VideoInfo> {
    let cursor = 0;
    for (let page = 1; page < 100; page++) {
      const postList = await this._download_json<Record<string, unknown>>(
        `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/${this._API_ENDPOINT}/`,
        displayId,
        `Downloading video list page ${page}`,
        {
          query: {
            [this._QUERY_NAME]: listId,
            cursor: String(cursor),
            count: '20',
            type: '5',
            device_id: String(Math.floor(Math.random() * 1e18)),
          },
        },
      );

      for (const video of (postList.aweme_list as Array<Record<string, unknown>>) || []) {
        const awemeId = String(video.aweme_id);
        yield this.url_result(`https://tiktok.com/@_/video/${awemeId}`, 'TikTok', awemeId);
      }
      if (!postList.has_more) break;
      cursor = Number(postList.cursor || 0);
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const listId = this._match_id(url);
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(listId, listId)) entries.push(e);
    return this.playlist_result(entries, listId);
  }
}

export class TikTokSoundIE extends TikTokBaseListIE {
  static IE_NAME = 'tiktok:sound';
  static _VALID_URL = /https?:\/\/(?:www\.)?tiktok\.com\/music\/[\w.-]+-(?<id>[\d]+)[/?#&]?/;
  protected _QUERY_NAME = 'music_id';
  protected _API_ENDPOINT = 'music/aweme';
}

export class TikTokEffectIE extends TikTokBaseListIE {
  static IE_NAME = 'tiktok:effect';
  static _VALID_URL = /https?:\/\/(?:www\.)?tiktok\.com\/sticker\/[\w.-]+-(?<id>[\d]+)[/?#&]?/;
  protected _QUERY_NAME = 'sticker_id';
  protected _API_ENDPOINT = 'sticker/aweme';
}

export class TikTokTagIE extends TikTokBaseListIE {
  static IE_NAME = 'tiktok:tag';
  static _VALID_URL = /https?:\/\/(?:www\.)?tiktok\.com\/tag\/(?<id>[^/?#&]+)/;
  protected _QUERY_NAME = 'ch_id';
  protected _API_ENDPOINT = 'challenge/aweme';

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId, undefined, {
      headers: { 'User-Agent': 'facebookexternalhit/1.1' },
    });
    const tagId = this._html_search_regex(/snssdk\d*:\/\/challenge\/detail\/(\d+)/, webpage, 'tag ID');
    if (!tagId) throw new ExtractorError('Unable to extract tag ID', { expected: true });
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(tagId, displayId)) entries.push(e);
    return this.playlist_result(entries, tagId, displayId);
  }
}

export class TikTokCollectionIE extends TikTokBaseIE {
  static IE_NAME = 'tiktok:collection';
  static _VALID_URL =
    /https?:\/\/www\.tiktok\.com\/@(?<user_id>[\w.-]+)\/collection\/(?<title>[^/?#]+)-(?<id>\d+)\/?(?:[?#]|$)/;

  protected async *_entries(collectionId: string): AsyncGenerator<VideoInfo> {
    let cursor = 0;
    for (let page = 1; page < 100; page++) {
      const response = await this._download_json<Record<string, unknown>>(
        'https://www.tiktok.com/api/collection/item_list/',
        collectionId,
        `Downloading page ${page}`,
        {
          query: {
            aid: '1988',
            collectionId,
            count: '30',
            cursor: String(cursor),
            sourceType: '113',
          },
          headers: WEB_HEADERS,
        },
      );

      for (const video of (response.itemList as Array<Record<string, unknown>>) || []) {
        const videoId = String(video.id);
        const author =
          str_or_none(traverse_obj(video, ['author', 'uniqueId'])) ||
          str_or_none(traverse_obj(video, ['author', 'secUid'])) ||
          '_';
        yield this.url_result(this._createUrl(author, videoId), 'TikTok', videoId);
      }
      if (!response.hasMore) break;
      cursor += 30;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(m.groups!.id!)) entries.push(e);
    return this.playlist_result(entries, m.groups!.id!, `${m.groups!.user_id}-${m.groups!.title}`);
  }
}

export class TikTokVMIE extends InfoExtractor {
  static IE_NAME = 'vm.tiktok';
  static _VALID_URL =
    /https?:\/\/(?:(?:vm|vt)\.tiktok\.com|(?:www\.)tiktok\.com\/t)\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    const handle = await this._request_webpage(url, id, undefined, {
      headers: { 'User-Agent': 'facebookexternalhit/1.1' },
    });
    if (!handle) throw new ExtractorError('Failed to resolve short URL');
    if (TikTokVMIE._VALID_URL.test(handle.url)) {
      throw new ExtractorError(`Redirect loop: ${handle.url}`, { expected: true });
    }
    return this.url_result(handle.url, TikTokIE.suitable(handle.url) ? 'TikTok' : undefined);
  }
}

export class TikTokLiveIE extends TikTokBaseIE {
  static IE_NAME = 'tiktok:live';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?tiktok\.com\/@(?<uploader>[\w.-]+)\/live|m\.tiktok\.com\/share\/live\/(?<id>\d+))/;

  protected async _callLiveApi(
    apiUrl: string,
    param: string,
    roomId: string,
    uploader: string | null,
    key?: string,
  ): Promise<Record<string, unknown>> {
    const response = await this._download_json<Record<string, unknown>>(apiUrl, roomId, undefined, {
      fatal: false,
      query: { aid: '1988', [param]: roomId },
    });
    const data = ((key ? traverse_obj(response, [key]) : response) || {}) as Record<string, unknown>;
    if (Number(data.status) === 2) return data;
    if (!uploader) throw new ExtractorError('This livestream has ended', { expected: true });
    throw new UserNotLive(uploader);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let uploader = m.groups!.uploader || null;
    let roomId = m.groups!.id || null;

    if (!roomId && uploader) {
      const webpage = await this._download_webpage(
        this._UPLOADER_URL_FORMAT.replace('%s', uploader),
        uploader,
        undefined,
        { headers: WEB_HEADERS },
      );
      roomId =
        str_or_none(
          traverse_obj(extractUniversalData(webpage), [
            'webapp.user-detail',
            'userInfo',
            'user',
            'roomId',
          ]),
        ) || null;
    }

    if (!roomId) throw new UserNotLive(uploader || url);

    let liveInfo = await this._callLiveApi(
      'https://webcast.tiktok.com/webcast/room/info',
      'room_id',
      roomId,
      uploader,
      'data',
    );

    const formats: Format[] = [];
    const hlsPull = url_or_none(traverse_obj(liveInfo, ['stream_url', 'hls_pull_url']));
    if (hlsPull) {
      formats.push({ url: hlsPull, ext: 'mp4', protocol: 'm3u8_native', format_id: 'hls-pull' });
    }

    for (const [fId, fUrl] of Object.entries(
      (traverse_obj(liveInfo, ['stream_url', 'flv_pull_url']) as Record<string, string>) || {},
    )) {
      if (url_or_none(fUrl)) {
        formats.push({ url: fUrl, ext: 'flv', format_id: `flv-${fId}`.toLowerCase() });
      }
    }

    if (!formats.some((f) => f.ext === 'mp4')) {
      const fallback = await this._callLiveApi(
        'https://www.tiktok.com/api/live/detail/',
        'roomID',
        roomId,
        uploader,
        'LiveRoomInfo',
      );
      liveInfo = { ...liveInfo, ...fallback };
      const liveUrl = url_or_none(liveInfo.liveUrl);
      if (liveUrl) {
        formats.push({ url: liveUrl, ext: 'mp4', protocol: 'm3u8_native', format_id: 'hls-fallback' });
      }
    }

    uploader =
      uploader ||
      str_or_none(traverse_obj(liveInfo, ['ownerInfo', 'uniqueId'])) ||
      str_or_none(traverse_obj(liveInfo, ['owner', 'display_id'])) ||
      null;

    return {
      id: roomId,
      uploader: uploader ?? undefined,
      uploader_url: uploader ? this._UPLOADER_URL_FORMAT.replace('%s', uploader) : undefined,
      is_live: true,
      formats,
      title: str_or_none(liveInfo.title) ?? undefined,
      uploader_id:
        str_or_none(traverse_obj(liveInfo, ['ownerInfo', 'owner', 'id'])) ??
        str_or_none(traverse_obj(liveInfo, ['owner', 'id'])) ??
        undefined,
      creator:
        str_or_none(traverse_obj(liveInfo, ['ownerInfo', 'owner', 'nickname'])) ??
        str_or_none(traverse_obj(liveInfo, ['owner', 'nickname'])) ??
        undefined,
      concurrent_view_count:
        int_or_none(liveInfo.user_count) ??
        int_or_none(traverse_obj(liveInfo, ['liveRoomStats', 'userCount'])) ??
        undefined,
    };
  }
}

/**
 * IqiyiIE — aligned with yt-dlp iqiyi.py (domestic iqiyi.com / pps.tv)
 */

import CryptoJS from 'crypto-js';
import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

const IQ_HEADERS: Record<string, string> = {
  Referer: 'https://www.iqiyi.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const FORMATS_MAP: Record<string, number> = {
  '96': 1,
  '1': 2,
  '2': 3,
  '21': 4,
  '4': 5,
  '17': 5,
  '5': 6,
  '18': 7,
};

function md5Text(text: string): string {
  return CryptoJS.MD5(text).toString(CryptoJS.enc.Hex);
}

function removeStart(text: string, start: string): string {
  return text.startsWith(start) ? text.slice(start.length) : text;
}

export class IqiyiIE extends InfoExtractor {
  static IE_NAME = 'iqiyi';
  static IE_DESC = '爱奇艺';
  static _VALID_URL = /https?:\/\/(?:(?:[^.]+\.)?iqiyi\.com|www\.pps\.tv)\/.+\.html/i;

  private async getRawData(tvid: string, videoId: string): Promise<Record<string, unknown>> {
    const tm = Date.now();
    const key = 'd5fb4bd9d50c4be6948c97edd7254b0e';
    const sc = md5Text(`${tm}${key}${tvid}`);
    const params = {
      tvid,
      vid: videoId,
      src: '76f90cbd92f94a2e925d83e8ccd22cb7',
      sc,
      t: String(tm),
    };
    const url = `http://cache.m.iqiyi.com/jp/tmts/${tvid}/${videoId}/`;
    const text = await this._download_webpage(url, videoId, 'Downloading iqiyi tmts', {
      query: params,
      headers: { ...IQ_HEADERS, ...this.geo_verification_headers() },
    });
    return this._parse_json(removeStart(text, 'var tvInfoJs='), videoId) as Record<string, unknown>;
  }

  private async extractPlaylist(webpage: string): Promise<VideoInfo | null> {
    const links = [
      ...webpage.matchAll(
        /<a[^>]+class="site-piclist_pic_link"[^>]+href="(http:\/\/www\.iqiyi\.com\/.+\.html)"/gi,
      ),
    ].map((m) => m[1]!);
    if (!links.length) return null;

    const albumId = this._search_regex(/albumId\s*:\s*(\d+),/, webpage, 'album ID')!;
    const albumTitle = this._html_search_regex(
      /data-share-title="([^"]+)"/,
      webpage,
      'album title',
      null,
      false,
    );

    const entries: VideoInfo[] = links.map((link) => this.url_result(link, 'Iqiyi'));
    const PAGE_SIZE = 50;

    for (let pageNum = 2; ; pageNum++) {
      const pagelistPage = await this._download_webpage(
        `http://cache.video.qiyi.com/jp/avlist/${albumId}/${pageNum}/${PAGE_SIZE}/`,
        albumId,
        `Downloading playlist page ${pageNum}`,
        { headers: IQ_HEADERS, fatal: false },
      );
      if (!pagelistPage) break;
      const pagelist = this._parse_json(
        removeStart(pagelistPage, 'var tvInfoJs='),
        albumId,
        undefined,
        false,
      ) as { data?: { vlist?: Array<{ vurl?: string }> } } | null;
      const vlist = pagelist?.data?.vlist || [];
      for (const item of vlist) {
        if (item.vurl) entries.push(this.url_result(item.vurl, 'Iqiyi'));
      }
      if (vlist.length < PAGE_SIZE) break;
    }

    return this.playlist_result(entries, albumId, albumTitle);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, 'temp_id', 'Downloading iqiyi video page', {
      headers: IQ_HEADERS,
    });

    let tvid = this._search_regex(
      /data-(?:player|shareplattrigger)-tvid\s*=\s*['"](\d+)/,
      webpage,
      'tvid',
      null,
      false,
    );
    if (!tvid) {
      const playlist = await this.extractPlaylist(webpage);
      if (playlist) return playlist;
      throw new ExtractorError("Can't find any iqiyi video", { expected: true });
    }

    const videoId = this._search_regex(
      /data-(?:player|shareplattrigger)-videoid\s*=\s*['"]([a-f\d]+)/,
      webpage,
      'video_id',
    );
    if (!videoId) {
      throw new ExtractorError('Unable to extract iqiyi video_id', { expected: true });
    }

    let formats: Format[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const rawData = await this.getRawData(tvid, videoId);
      if (rawData.code !== 'A00000') {
        if (rawData.code === 'A00111') {
          this.raise_geo_restricted();
        }
        throw new ExtractorError(`Unable to load iqiyi data. Error code: ${String(rawData.code)}`, {
          expected: true,
        });
      }

      const data = rawData.data as Record<string, unknown>;
      const vidl = (data.vidl as Record<string, unknown>[]) || [];
      formats = vidl
        .filter((stream) => stream.m3utx)
        .map((stream) => {
          const vd = String(stream.vd);
          return {
            url: String(stream.m3utx),
            format_id: vd,
            ext: 'mp4',
            quality: FORMATS_MAP[vd] ?? -1,
            protocol: 'm3u8_native' as const,
            http_headers: IQ_HEADERS,
          };
        });

      if (formats.length) break;
      await new Promise((r) => setTimeout(r, 5000));
    }

    if (!formats.length) {
      throw new ExtractorError('No iqiyi formats found', { expected: true });
    }

    const title =
      this._html_search_regex(/id="widget-videotitle"[^>]*>([^<]+)/, webpage, 'title', null, false) ||
      this._html_search_regex(/class="mod-play-tit"[^>]*>([^<]+)/, webpage, 'title', null, false) ||
      this._html_search_regex(
        /<span[^>]+data-videochanged-title="word"[^>]*>([^<]+)<\/span>/,
        webpage,
        'title',
        null,
        false,
      ) ||
      videoId;

    return {
      id: videoId,
      title: title || videoId,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'iqiyi',
      extractor_key: 'Iqiyi',
      http_headers: IQ_HEADERS,
    };
  }
}

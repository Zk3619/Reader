/**
 * VQQVideoIE / VQQSeriesIE — aligned with yt-dlp tencent.py (VQQ subset)
 */

import CryptoJS from 'crypto-js';
import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  js_to_json,
  str_or_none,
  traverse_obj,
} from '../utils';

const VQQ_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const VQQ_HEADERS: Record<string, string> = {
  Referer: 'https://v.qq.com/',
  'User-Agent': VQQ_UA,
};

function randomId(len: number): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function padWhitespaceBytes(data: Uint8Array): Uint8Array {
  const padLen = 16 - (data.length % 16);
  const out = new Uint8Array(data.length + padLen);
  out.set(data);
  out.fill(0x20, data.length);
  return out;
}

function aesCbcEncryptHex(data: Uint8Array, key: Uint8Array, iv: Uint8Array): string {
  const wordKey = CryptoJS.lib.WordArray.create(Array.from(key));
  const wordIv = CryptoJS.lib.WordArray.create(Array.from(iv));
  const wordData = CryptoJS.lib.WordArray.create(Array.from(data));
  const encrypted = CryptoJS.AES.encrypt(wordData, wordKey, {
    iv: wordIv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.NoPadding,
  });
  return encrypted.ciphertext.toString(CryptoJS.enc.Hex).toUpperCase();
}

function getCkey(
  videoId: string,
  videoUrl: string,
  guid: string,
  appVersion: string,
  platform: string,
  ua: string,
): string {
  const payload = `${videoId}|${Math.floor(Date.now() / 1000)}|mg3c3b04ba|${appVersion}|${guid}|${platform}|${videoUrl.slice(0, 48)}|${ua.toLowerCase().slice(0, 48)}||Mozilla|Netscape|Windows x86_64|00|`;
  const checksum = [...payload].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const inner = `|${checksum}|${payload}`;
  const data = padWhitespaceBytes(new TextEncoder().encode(inner));
  const key = new Uint8Array([
    0x4f, 0x6b, 0xda, 0xa3, 0x9e, 0x2f, 0x8c, 0xb0, 0x7f, 0x5e, 0x72, 0x2d, 0x9e, 0xde, 0xf3, 0x14,
  ]);
  const iv = new Uint8Array([
    0x01, 0x50, 0x4a, 0xf3, 0x56, 0xe6, 0x19, 0xcf, 0x2e, 0x42, 0xbb, 0xa6, 0x8c, 0x3f, 0x70, 0xf9,
  ]);
  return aesCbcEncryptHex(data, key, iv);
}

function cleanTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  return (
    title
      .replace(
        /\s*[_\-]\s*(?:Watch online|Watch HD Video Online|WeTV|腾讯视频|(?:高清)?1080P在线观看平台).*?$/i,
        '',
      )
      .trim() || null
  );
}

abstract class TencentBaseIE extends InfoExtractor {
  protected abstract readonly apiUrl: string;
  protected abstract readonly appVersion: string;
  protected abstract readonly platform: string;
  protected abstract readonly host: string;
  protected abstract readonly referer: string;

  protected checkApiResponse(apiResponse: Record<string, unknown>): void {
    const msg = apiResponse.msg;
    if (apiResponse.code !== '0.0' && msg != null) {
      const text = String(msg);
      if (
        text.includes('您所在区域暂无此内容版权') ||
        text.includes('This content is not available in your area')
      ) {
        this.raise_geo_restricted(text);
      }
      throw new ExtractorError(`Tencent said: ${text}`, { expected: true });
    }
  }

  protected async getVideoApiResponse(
    videoUrl: string,
    videoId: string,
    seriesId: string | null | undefined,
    subtitleFormat: 'srt' | 'vtt',
    videoFormat: 'hls' | 'mp4',
    videoQuality: string,
  ): Promise<Record<string, unknown>> {
    const guid = randomId(16);
    const ua = String(this.params.http_headers?.['User-Agent'] || VQQ_UA);
    const ckey = getCkey(videoId, videoUrl, guid, this.appVersion, this.platform, ua);
    const query: Record<string, string> = {
      vid: videoId,
      cKey: ckey,
      encryptVer: '8.1',
      spcaptiontype: subtitleFormat === 'vtt' ? '1' : '0',
      sphls: videoFormat === 'hls' ? '2' : '0',
      dtype: videoFormat === 'hls' ? '3' : '0',
      defn: videoQuality,
      spsrt: '2',
      sphttps: '1',
      otype: 'json',
      spwm: '1',
      hevclv: '28',
      drm: '40',
      spvideo: '4',
      spsfrhdr: '100',
      host: this.host,
      referer: this.referer,
      ehost: videoUrl,
      appVer: this.appVersion,
      platform: this.platform,
      guid,
      flowid: randomId(32),
    };
    if (seriesId) query.cid = seriesId;

    const page = await this._download_webpage(this.apiUrl, videoId, 'Downloading Tencent getvinfo', {
      query,
      headers: VQQ_HEADERS,
    });
    const apiResponse = this._search_json<Record<string, unknown>>(
      /QZOutputJson=/,
      page,
      'api_response',
      videoId,
    );
    if (!apiResponse) {
      throw new ExtractorError('Unable to parse Tencent API response', { expected: true });
    }
    return apiResponse;
  }

  protected async extractVideoFormats(
    apiResponse: Record<string, unknown>,
    videoId: string,
  ): Promise<Format[]> {
    const videoResponse = traverse_obj(apiResponse, ['vl', 'vi', 0]) as Record<string, unknown>;
    if (!videoResponse) return [];

    const uiList = traverse_obj(videoResponse, ['ul', 'ui']) as Record<string, unknown>[] | undefined;
    const formats: Format[] = [];

    for (const videoFormat of uiList || []) {
      const baseUrl = String(videoFormat.url || '');
      const hlsPt = str_or_none(traverse_obj(videoFormat, ['hls', 'pt'])) || '';
      if (videoFormat.hls || determine_ext(baseUrl) === 'm3u8') {
        const m3u8Url = `${baseUrl}${hlsPt}`;
        const fmts = await this._extract_m3u8_formats(
          m3u8Url,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
          { headers: VQQ_HEADERS },
        );
        formats.push(...fmts);
      } else if (baseUrl) {
        formats.push({
          format_id: 'mp4',
          url: `${baseUrl}${videoResponse.fn}?vkey=${videoResponse.fvkey}`,
          ext: 'mp4',
          protocol: 'https',
          http_headers: VQQ_HEADERS,
        });
      }
    }

    const identifier = videoResponse.br;
    const fiList =
      ((apiResponse.fl as Record<string, unknown> | undefined)?.fi as Record<string, unknown>[]) ||
      [];
    const formatResponse = fiList.find((fi) => fi.br === identifier);

    const commonInfo = {
      width: int_or_none(videoResponse.vw),
      height: int_or_none(videoResponse.vh),
      abr: float_or_none(formatResponse?.audiobandwidth, 1000),
      vbr: float_or_none(formatResponse?.bandwidth, 1000),
      fps: int_or_none(formatResponse?.vfps),
      format: str_or_none(formatResponse?.sname) || undefined,
      format_id: str_or_none(formatResponse?.name) || undefined,
      format_note: str_or_none(formatResponse?.resolution) || undefined,
      dynamic_range: formatResponse?.name === 'hdr10' ? ('hdr10' as const) : ('sdr' as const),
      has_drm: formatResponse?.drm != null && Number(formatResponse.drm) !== 0,
    };

    return formats.map((f) => ({
      ...f,
      width: commonInfo.width,
      height: commonInfo.height,
      abr: commonInfo.abr,
      vbr: commonInfo.vbr,
      fps: commonInfo.fps,
      format: commonInfo.format ?? f.format,
      format_id: commonInfo.format_id || f.format_id || '0',
      format_note: commonInfo.format_note ?? f.format_note,
      dynamic_range: commonInfo.dynamic_range,
      has_drm: commonInfo.has_drm,
      http_headers: VQQ_HEADERS,
    }));
  }

  protected async extractAllVideoFormats(
    url: string,
    videoId: string,
    seriesId: string | null | undefined,
  ): Promise<Format[]> {
    const apiResponses: Record<string, unknown>[] = [
      await this.getVideoApiResponse(url, videoId, seriesId, 'srt', 'hls', 'hd'),
    ];
    this.checkApiResponse(apiResponses[0]!);

    const fiList =
      ((apiResponses[0]!.fl as Record<string, unknown> | undefined)?.fi as Record<string, unknown>[]) ||
      [];
    let qualities = fiList.map((fi) => String(fi.name || '')).filter(Boolean);
    if (!qualities.length) qualities = ['shd', 'fhd'];
    for (const q of qualities) {
      if (q === 'ld' || q === 'sd' || q === 'hd') continue;
      const resp = await this.getVideoApiResponse(url, videoId, seriesId, 'vtt', 'hls', q);
      this.checkApiResponse(resp);
      apiResponses.push(resp);
    }

    const formats: Format[] = [];
    for (const apiResponse of apiResponses) {
      formats.push(...(await this.extractVideoFormats(apiResponse, videoId)));
    }
    return formats;
  }
}

abstract class VQQBaseIE extends TencentBaseIE {
  protected apiUrl = 'https://h5vv6.video.qq.com/getvinfo';
  protected appVersion = '3.5.57';
  protected platform = '10901';
  protected host = 'v.qq.com';
  protected referer = 'v.qq.com';

  protected getWebpageMetadata(webpage: string, videoId: string): Record<string, unknown> | null {
    return this._search_json<Record<string, unknown>>(
      /<script[^>]*>[^<]*window\.__(?:pinia|PINIA__)\s*=/,
      webpage,
      'pinia data',
      videoId,
      { transform_source: js_to_json, fatal: false },
    );
  }
}

export class VQQVideoIE extends VQQBaseIE {
  static IE_NAME = 'vqq:video';
  static IE_DESC = 'Tencent Video (v.qq.com)';
  static _VALID_URL =
    /https?:\/\/v\.qq\.com\/x\/(?:page|cover\/(?<series_id>\w+))\/(?<id>\w+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = url.match(VQQVideoIE._VALID_URL)!;
    const videoId = m.groups?.id || m[1] || '';
    const seriesId = m.groups?.series_id || m[2] || null;

    const webpage = await this._download_webpage(url, videoId, 'Downloading VQQ webpage', {
      headers: VQQ_HEADERS,
    });
    const webpageMetadata = this.getWebpageMetadata(webpage, videoId);

    const formats = await this.extractAllVideoFormats(url, videoId, seriesId);
    if (!formats.length) {
      throw new ExtractorError('No Tencent video formats found', { expected: true });
    }

    const ogTitle = this._og_search_title(webpage);
    const metaTitle = str_or_none(traverse_obj(webpageMetadata, ['global', 'videoInfo', 'title']));
    const title = cleanTitle(ogTitle || metaTitle) || videoId;

    return {
      id: videoId,
      title,
      description:
        this._og_search_description(webpage) ||
        str_or_none(traverse_obj(webpageMetadata, ['global', 'videoInfo', 'desc'])) ||
        null,
      formats,
      thumbnail:
        this._og_search_thumbnail(webpage) ||
        str_or_none(traverse_obj(webpageMetadata, ['global', 'videoInfo', 'pic160x90'])) ||
        undefined,
      series: str_or_none(traverse_obj(webpageMetadata, ['global', 'coverInfo', 'title'])) || undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'vqq:video',
      extractor_key: 'VQQVideo',
      http_headers: VQQ_HEADERS,
    };
  }
}

export class VQQSeriesIE extends VQQBaseIE {
  static IE_NAME = 'vqq:series';
  static IE_DESC = 'Tencent Video series (v.qq.com cover page)';
  static _VALID_URL = /https?:\/\/v\.qq\.com\/x\/cover\/(?<id>\w+)\.html\/?(?:[?#]|$)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const seriesId = this._match_id(url);
    const webpage = await this._download_webpage(url, seriesId, 'Downloading VQQ series webpage', {
      headers: VQQ_HEADERS,
    });
    const webpageMetadata = this.getWebpageMetadata(webpage, seriesId);

    const episodePaths = [
      ...webpage.matchAll(
        /<div[^>]+data-vid="(?<video_id>[^"]+)"[^>]+class="[^"]+episode-item-rect--number/gi,
      ),
    ].map((m) => `/x/cover/${seriesId}/${m.groups?.video_id || m[1]}.html`);

    const base = new URL(url);
    const entries = episodePaths.map((path) => {
      const episodeUrl = `${base.origin}${path}`;
      const vid = path.split('/').pop()?.replace(/\.html$/i, '') || seriesId;
      return this.url_result(episodeUrl, 'VQQVideo', vid);
    });

    const coverTitle =
      cleanTitle(str_or_none(traverse_obj(webpageMetadata, ['coverInfo', 'title']))) ||
      cleanTitle(this._og_search_title(webpage));
    const description =
      str_or_none(traverse_obj(webpageMetadata, ['coverInfo', 'description'])) ||
      this._og_search_description(webpage);

    return this.playlist_result(entries, seriesId, coverTitle, description);
  }
}

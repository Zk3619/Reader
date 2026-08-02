/**
 * Tencent WeTV / iFlix / VQQBase — ported from yt-dlp tencent.py
 * VQQVideoIE / VQQSeriesIE remain in ../tencent.ts
 */

import CryptoJS from 'crypto-js';
import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  js_to_json,
  str_or_none,
  traverse_obj,
} from '../../utils';
import { urljoin } from '../hand-a/_helpers';
import { playlistFromMatches } from '../hand-a/helpers';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, searchNextjsData } from './_helpers';

const VQQ_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADERS: Record<string, string> = {
  Referer: 'https://v.qq.com/',
  'User-Agent': VQQ_UA,
};

function randomId(len: number): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]!;
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

export class TencentBaseIE extends InfoExtractor {
  static IE_NAME = 'tencentbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected readonly apiUrl: string = '';
  protected readonly appVersion: string = '';
  protected readonly platform: string = '';
  protected readonly host: string = '';
  protected readonly referer: string = '';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TencentBaseIE is not a standalone extractor', { expected: true });
  }

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
      headers: HEADERS,
    });
    return (
      this._search_json<Record<string, unknown>>(/QZOutputJson=/, page, 'api_response', videoId) || {}
    );
  }

  protected async extractVideoFormatsAndSubtitles(
    apiResponse: Record<string, unknown>,
    videoId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const videoResponse = traverse_obj(apiResponse, ['vl', 'vi', 0]) as Record<string, unknown>;
    if (!videoResponse) return { formats: [], subtitles: {} };

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    const uiList = traverse_obj(videoResponse, ['ul', 'ui']) as Array<Record<string, unknown>> | undefined;

    for (const videoFormat of uiList || []) {
      const baseUrl = String(videoFormat.url || '');
      const hlsPt = str_or_none(traverse_obj(videoFormat, ['hls', 'pt'])) || '';
      if (videoFormat.hls || determine_ext(baseUrl) === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, `${baseUrl}${hlsPt}`, videoId, 'hls');
        formats.push(...res.formats);
        subtitles = mergeSubtitles(subtitles, res.subtitles);
      } else if (baseUrl) {
        formats.push({
          format_id: 'mp4',
          url: `${baseUrl}${videoResponse.fn}?vkey=${videoResponse.fvkey}`,
          ext: 'mp4',
          http_headers: HEADERS,
        });
      }
    }

    const identifier = videoResponse.br;
    const fiList =
      ((apiResponse.fl as Record<string, unknown> | undefined)?.fi as Record<string, unknown>[]) || [];
    const formatResponse = fiList.find((fi) => fi.br === identifier);
    const common = {
      width: int_or_none(videoResponse.vw) ?? undefined,
      height: int_or_none(videoResponse.vh) ?? undefined,
      abr: float_or_none(formatResponse?.audiobandwidth, 1000) ?? undefined,
      vbr: float_or_none(formatResponse?.bandwidth, 1000) ?? undefined,
      fps: int_or_none(formatResponse?.vfps) ?? undefined,
      format_id: str_or_none(formatResponse?.name) || '0',
      format_note: str_or_none(formatResponse?.resolution) ?? undefined,
      has_drm: formatResponse?.drm != null && Number(formatResponse.drm) !== 0,
    };
    for (const f of formats) Object.assign(f, common, { http_headers: HEADERS });

    return { formats, subtitles };
  }

  protected extractVideoNativeSubtitles(
    apiResponse: Record<string, unknown>,
  ): Record<string, Subtitle[]> {
    const subtitles: Record<string, Subtitle[]> = {};
    for (const subtitle of (traverse_obj(apiResponse, ['sfl', 'fi']) as Array<Record<string, unknown>>) || []) {
      const lang = String(subtitle.lang || 'und').toLowerCase();
      (subtitles[lang] ||= []).push({
        url: String(subtitle.url),
        ext: Number(subtitle.captionType) === 1 ? 'srt' : 'vtt',
        protocol: determine_ext(String(subtitle.url)) === 'm3u8' ? 'm3u8_native' : 'http',
      });
    }
    return subtitles;
  }

  protected async extractAllVideoFormatsAndSubtitles(
    url: string,
    videoId: string,
    seriesId: string | null | undefined,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const apiResponses = [await this.getVideoApiResponse(url, videoId, seriesId, 'srt', 'hls', 'hd')];
    this.checkApiResponse(apiResponses[0]!);

    let qualities = (
      ((apiResponses[0]!.fl as Record<string, unknown> | undefined)?.fi as Record<string, unknown>[]) || []
    )
      .map((fi) => String(fi.name || ''))
      .filter(Boolean);
    if (!qualities.length) qualities = ['shd', 'fhd'];

    for (const q of qualities) {
      if (q === 'ld' || q === 'sd' || q === 'hd') continue;
      const resp = await this.getVideoApiResponse(url, videoId, seriesId, 'vtt', 'hls', q);
      this.checkApiResponse(resp);
      apiResponses.push(resp);
    }

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    for (const apiResponse of apiResponses) {
      const { formats: fmts, subtitles: subs } = await this.extractVideoFormatsAndSubtitles(
        apiResponse,
        videoId,
      );
      const native = this.extractVideoNativeSubtitles(apiResponse);
      formats.push(...fmts);
      subtitles = mergeSubtitles(subtitles, subs);
      subtitles = mergeSubtitles(subtitles, native);
    }
    return { formats, subtitles };
  }

  protected getCleanTitle(title: string | null | undefined): string | null {
    return cleanTitle(title);
  }
}

export class VQQBaseIE extends TencentBaseIE {
  static IE_NAME = 'vqqbase';
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

export class WeTvBaseIE extends TencentBaseIE {
  static IE_NAME = 'wetvbase';
  static _VALID_URL_BASE = /https?:\/\/(?:www\.)?wetv\.vip\/(?:[^?#]+\/)?play/;

  protected apiUrl = 'https://play.wetv.vip/getvinfo';
  protected appVersion = '3.5.57';
  protected platform = '4830201';
  protected host = 'wetv.vip';
  protected referer = 'wetv.vip';

  protected getWebpageMetadata(webpage: string, videoId: string): Record<string, unknown> {
    const props = searchNextjsData(this, webpage, videoId) as { pageProps?: { data?: unknown } };
    return this._parse_json(String(props.pageProps?.data ?? '{}'), videoId) as Record<string, unknown>;
  }

  protected async extractEpisode(url: string): Promise<VideoInfo> {
    const m = url.match(/\/play\/(?<series_id>\w+)(?:-[^?#]+)?\/(?<id>\w+)(?:-[^?#]+)?/i)!;
    const videoId = m.groups!.id!;
    const seriesId = m.groups!.series_id!;
    const webpage = await this._download_webpage(url, videoId);
    const webpageMetadata = this.getWebpageMetadata(webpage, videoId);
    const { formats, subtitles } = await this.extractAllVideoFormatsAndSubtitles(url, videoId, seriesId);

    return {
      id: videoId,
      title:
        this.getCleanTitle(this._og_search_title(webpage)) ||
        this.getCleanTitle(str_or_none(traverse_obj(webpageMetadata, ['coverInfo', 'title']))) ||
        videoId,
      description:
        str_or_none(traverse_obj(webpageMetadata, ['coverInfo', 'description'])) ||
        this._og_search_description(webpage) ||
        undefined,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      duration: int_or_none(traverse_obj(webpageMetadata, ['videoInfo', 'duration'])) ?? undefined,
      series: str_or_none(traverse_obj(webpageMetadata, ['coverInfo', 'title'])) ?? undefined,
      episode_number: int_or_none(traverse_obj(webpageMetadata, ['videoInfo', 'episode'])) ?? undefined,
    };
  }

  protected async extractSeries(url: string, ieKey: string): Promise<VideoInfo> {
    const seriesId = this._match_id(url);
    const webpage = await this._download_webpage(url, seriesId);
    const webpageMetadata = this.getWebpageMetadata(webpage, seriesId);

    const videoList = (webpageMetadata.videoList as Array<{ vid: string }>) || [];
    let paths = videoList.map((ep) => `/play/${seriesId}/${ep.vid}`);
    if (!paths.length) {
      paths = [...webpage.matchAll(/<a[^>]+class="play-video__link"[^>]+href="(?<path>[^"]+)"/gi)].map(
        (x) => x.groups!.path!,
      );
    }

    const urls = paths.map((p) => urljoin(url, p));
    return playlistFromMatches(this, urls, seriesId, {
      ie: ieKey,
      title:
        this.getCleanTitle(str_or_none(traverse_obj(webpageMetadata, ['coverInfo', 'title']))) ||
        this.getCleanTitle(this._og_search_title(webpage)) ||
        seriesId,
      description:
        str_or_none(traverse_obj(webpageMetadata, ['coverInfo', 'description'])) ||
        this._og_search_description(webpage) ||
        undefined,
    });
  }
}

export class WeTvEpisodeIE extends WeTvBaseIE {
  static IE_NAME = 'wetv:episode';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?wetv\.vip\/(?:[^?#]+\/)?play\/(?<series_id>\w+)(?:-[^?#]+)?\/(?<id>\w+)(?:-[^?#]+)?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this.extractEpisode(url);
  }
}

export class WeTvSeriesIE extends WeTvBaseIE {
  static IE_NAME = 'wetv:series';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?wetv\.vip\/(?:[^?#]+\/)?play\/(?<id>\w+)(?:-[^/?#]+)?\/?(?:[?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this.extractSeries(url, 'WeTvEpisode');
  }
}

export class IflixBaseIE extends WeTvBaseIE {
  static IE_NAME = 'iflixbase';
  static _VALID_URL_BASE = /https?:\/\/(?:www\.)?iflix\.com\/(?:[^?#]+\/)?play/;

  protected apiUrl = 'https://vplay.iflix.com/getvinfo';
  protected platform = '330201';
  protected host = 'www.iflix.com';
  protected referer = 'www.iflix.com';
}

export class IflixEpisodeIE extends IflixBaseIE {
  static IE_NAME = 'iflix:episode';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?iflix\.com\/(?:[^?#]+\/)?play\/(?<series_id>\w+)(?:-[^?#]+)?\/(?<id>\w+)(?:-[^?#]+)?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this.extractEpisode(url);
  }
}

export class IflixSeriesIE extends IflixBaseIE {
  static IE_NAME = 'iflix:series';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?iflix\.com\/(?:[^?#]+\/)?play\/(?<id>\w+)(?:-[^/?#]+)?\/?(?:[?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this.extractSeries(url, 'IflixEpisode');
  }
}

/**
 * LeIE / LePlaylistIE — ported from yt-dlp leeco.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none } from '../../utils';
import { orderedSet } from './_helpers';
import { parseIso8601 } from '../hand-a/_helpers';

function encodeDataUri(data: Uint8Array, mime: string): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

function urshift(n: number, bits: number): number {
  return (n >>> bits) | (n << (32 - bits));
}

function calcTimeKey(param1: number): number {
  const loc2 = 185025305;
  return (urshift(param1, loc2 % 17) ^ loc2) >>> 0;
}

function decryptM3u8(encryptedData: Uint8Array | string): Uint8Array {
  const bytes = typeof encryptedData === 'string' ? new TextEncoder().encode(encryptedData) : encryptedData;
  const header = new TextDecoder().decode(bytes.slice(0, 5)).toLowerCase();
  if (header !== 'vc_01') return bytes;
  const encrypted = bytes.slice(5);

  const loc4 = new Uint8Array(encrypted.length * 2);
  for (let idx = 0; idx < encrypted.length; idx++) {
    const b = encrypted[idx]!;
    loc4[idx * 2] = Math.floor(b / 16);
    loc4[idx * 2 + 1] = b % 16;
  }
  const rotated = new Uint8Array([...loc4.slice(-11), ...loc4.slice(0, -11)]);
  const loc7 = new Uint8Array(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    loc7[i] = rotated[i * 2]! * 16 + rotated[i * 2 + 1]!;
  }
  return loc7;
}

export class LeIE extends InfoExtractor {
  static IE_NAME = 'le';
  static IE_DESC = '乐视网';
  static _VALID_URL =
    /https?:\/\/(?:www\.le\.com\/ptv\/vplay|(?:sports\.le|(?:www\.)?lesports)\.com\/(?:match|video))\/(?<id>\d+)\.html/;
  static _URL_TEMPLATE = 'http://www.le.com/ptv/vplay/%s.html';

  protected _checkErrors(playJson: Record<string, unknown>): void {
    const playstatus = (playJson.msgs as Record<string, unknown>)?.playstatus as Record<string, unknown> | undefined;
    if (int_or_none(playstatus?.status) === 0) {
      const flag = int_or_none(playstatus?.flag);
      if (flag === 1) this.raise_geo_restricted();
      throw new ExtractorError(`Generic error. flag = ${flag}`, { expected: true });
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const mediaId = this._match_id(url);
    const page = await this._download_webpage(url, mediaId);

    const playJsonFlash = await this._download_json<Record<string, unknown>>(
      'http://player-pc.le.com/mms/out/video/playJson',
      mediaId,
      'Downloading flash playJson data',
      {
        query: {
          id: mediaId,
          platid: '1',
          splatid: '105',
          format: '1',
          source: '1000',
          tkey: String(calcTimeKey(Math.floor(Date.now() / 1000))),
          domain: 'www.le.com',
          region: 'cn',
        },
        headers: this.geo_verification_headers(),
      },
    );
    this._checkErrors(playJsonFlash);

    const getFlashUrls = async (mediaUrl: string, formatId: string): Promise<Record<string, string>> => {
      const nodesData = await this._download_json<{ nodelist?: Array<{ location?: string }> }>(
        mediaUrl,
        mediaId,
        `Download JSON metadata for format ${formatId}`,
        { query: { m3v: '1', format: '1', expect: '3', tss: 'ios' } },
      );
      const location = nodesData.nodelist?.[0]?.location;
      if (!location) return {};
      const req = await this._request_webpage(location, mediaId, `Downloading m3u8 information for format ${formatId}`);
      const buf = new TextEncoder().encode(req?.text || '');
      const m3u8Data = decryptM3u8(buf);
      return { hls: encodeDataUri(m3u8Data, 'application/vnd.apple.mpegurl') };
    };

    const extractedFormats: string[] = [];
    const formats: Format[] = [];
    const playurl = (playJsonFlash.msgs as Record<string, unknown>).playurl as Record<string, unknown>;
    const playDomain = ((playurl.domain as string[]) || [])[0] || '';

    for (const [formatId, formatData] of Object.entries((playurl.dispatch as Record<string, unknown[]>) || {})) {
      if (extractedFormats.includes(formatId)) continue;
      extractedFormats.push(formatId);
      const mediaUrl = playDomain + (formatData as unknown[])[0];
      const flashUrls = await getFlashUrls(String(mediaUrl), formatId);
      for (const [protocol, formatUrl] of Object.entries(flashUrls)) {
        const f: Format = {
          url: formatUrl,
          ext: determine_ext(String((formatData as unknown[])[1])),
          format_id: `${protocol}-${formatId}`,
          protocol: protocol === 'hls' ? 'm3u8_native' : 'http',
          quality: int_or_none(formatId) ?? undefined,
        };
        if (formatId.endsWith('p')) {
          f.height = int_or_none(formatId.slice(0, -1)) ?? undefined;
        }
        formats.push(f);
      }
    }

    const publishTime = parseIso8601(
      this._html_search_regex(/发布时间&nbsp;([^<>]+) /, page, 'publish time', null, false),
      { delimiter: ' ', timezoneHours: 8 },
    );

    return {
      id: mediaId,
      formats,
      title: String(playurl.title ?? mediaId),
      thumbnail: playurl.pic ? String(playurl.pic) : undefined,
      description: this._html_search_meta('description', page, undefined, false) || undefined,
      timestamp: publishTime ?? undefined,
    };
  }
}

export class LePlaylistIE extends InfoExtractor {
  static IE_NAME = 'le:playlist';
  static _VALID_URL = /https?:\/\/[a-z]+\.le\.com\/(?!video)[a-z]+\/(?<id>[a-z0-9_]+)/;

  static suitable(url: string): boolean {
    if (LeIE.suitable(url)) return false;
    return InfoExtractor.suitable.call(this, url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const page = await this._download_webpage(url, playlistId);

    const mediaIds = orderedSet(
      [...page.matchAll(/<a[^>]+href="http:\/\/www\.letv\.com\/ptv\/vplay\/(\d+)\.html/g)].map((m) => m[1]!),
    );
    const entries = mediaIds.map((mediaId) =>
      this.url_result(LeIE._URL_TEMPLATE.replace('%s', mediaId), 'Le'),
    );

    const keywords = this._html_search_meta('keywords', page, undefined, false) || '';
    const title = keywords.split('，')[0] || playlistId;
    const description = this._html_search_meta('description', page, undefined, false) || undefined;

    return this.playlist_result(entries, playlistId, title, description);
  }
}

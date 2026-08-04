// @ts-nocheck
/** VideaIE â€?ported from yt-dlp videa.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  mimetype2ext,
  parse_codecs,
  parse_qs,
  update_url_query,
} from '../../utils';
import { protoRelative, urljoin } from './_helpers';

const STATIC_SECRET =
  'xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p';

function rc4(cipherText: Uint8Array | string, key: string): string {
  const bytes =
    typeof cipherText === 'string'
      ? Uint8Array.from(cipherText, (c) => c.charCodeAt(0))
      : cipherText;
  const S = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i]! + key.charCodeAt(i % key.length)) % 256;
    [S[i], S[j]] = [S[j]!, S[i]!];
  }
  let i = 0;
  j = 0;
  const out = new Uint8Array(bytes.length);
  for (let m = 0; m < bytes.length; m++) {
    i = (i + 1) % 256;
    j = (j + S[i]!) % 256;
    [S[i], S[j]] = [S[j]!, S[i]!];
    const k = S[(S[i]! + S[j]!) % 256]!;
    out[m] = k ^ bytes[m]!;
  }
  return new TextDecoder().decode(out);
}

function xmlTagText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m?.[1]?.trim() ?? null;
}

function xmlAttr(tagOpen: string, attr: string): string | null {
  const m = new RegExp(`\\b${attr}=["']([^"']*)["']`, 'i').exec(tagOpen);
  return m?.[1] ?? null;
}

export class VideaIE extends InfoExtractor {
  static IE_NAME = 'videa';
  static _VALID_URL =
    /https?:\/\/videa(?:kid)?\.hu\/(?:videok\/(?:[^/]+\/)*[^?#&]+-|(?:videojs_)?player\?.*?\bv=|player\/v\/)(?<id>[^?#&]+)/;

  static rc4 = rc4;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoPage = await this._download_webpage(url, videoId);

    let playerUrl = url;
    let playerPage = videoPage;
    if (!url.includes('videa.hu/player') && !url.includes('videakid.hu/player')) {
      const rel = this._search_regex(/<iframe.*?src="(\/player\?[^"]+)"/, videoPage, 'player url')!;
      playerUrl = urljoin(url, rel);
      playerPage = await this._download_webpage(playerUrl, videoId);
    }

    const nonce = this._search_regex(/_xt\s*=\s*"([^"]+)"/, playerPage, 'nonce')!;
    const l = nonce.slice(0, 32);
    const s = nonce.slice(32);
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += s[i - (STATIC_SECRET.indexOf(l[i]!) - 31)]!;
    }

    const query = parse_qs(playerUrl);
    const flatQuery: Record<string, string> = {};
    for (const [k, vals] of Object.entries(query)) {
      if (vals[0] != null) flatQuery[k] = vals[0];
    }
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomSeed = '';
    for (let i = 0; i < 8; i++) randomSeed += chars[Math.floor(Math.random() * chars.length)]!;
    flatQuery._s = randomSeed;
    flatQuery._t = result.slice(0, 16);

    // Need response header x-videa-xs for encrypted payloads
    let b64Info = '';
    let xsHeader = '';
    try {
      const http = await import('@/lib/http');
      const res = await http.request(
        update_url_query('http://videa.hu/player/xml', flatQuery),
        { method: 'GET', allowNon2xx: false, ignorePageNavigationAbort: true },
      );
      xsHeader = res.headers.get('x-videa-xs') || '';
      b64Info = await res.text();
    } catch {
      b64Info = await this._download_webpage('http://videa.hu/player/xml', videoId, undefined, {
        query: flatQuery,
      });
    }

    let infoXml: string;
    if (b64Info.startsWith('<?xml')) {
      infoXml = b64Info;
    } else {
      const key = result.slice(16) + randomSeed + xsHeader;
      const decoded = typeof atob === 'function' ? atob(b64Info) : Buffer.from(b64Info, 'base64').toString('binary');
      infoXml = rc4(decoded, key);
    }

    if (!/<video[\s>]/.test(infoXml) && /<error[\s>]/.test(infoXml)) {
      throw new ExtractorError(xmlTagText(infoXml, 'error') || 'Videa error', { expected: true });
    }

    const title = xmlTagText(infoXml, 'title');
    if (!title) throw new ExtractorError('Unable to extract title');

    const formats: Format[] = [];
    for (const m of infoXml.matchAll(/<video_source\b([^>]*)>([\s\S]*?)<\/video_source>/gi)) {
      const attrs = m[1] || '';
      let sourceUrl = (m[2] || '').trim();
      const sourceName = xmlAttr(attrs, 'name');
      const sourceExp = xmlAttr(attrs, 'exp');
      if (!sourceUrl || !sourceName) continue;

      const hashM = infoXml.match(
        new RegExp(`<hash_value_${sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>\\s*([^<]+)`, 'i'),
      );
      const hashValue = hashM?.[1]?.trim();
      if (hashValue && sourceExp) {
        sourceUrl = update_url_query(sourceUrl, { md5: hashValue, expires: sourceExp });
      }
      formats.push({
        ...parse_codecs(xmlAttr(attrs, 'codecs')),
        url: protoRelative(sourceUrl),
        ext: mimetype2ext(xmlAttr(attrs, 'mimetype')) || 'mp4',
        format_id: sourceName,
        width: int_or_none(xmlAttr(attrs, 'width')) ?? undefined,
        height: int_or_none(xmlAttr(attrs, 'height')) ?? undefined,
      });
    }

    const poster = xmlTagText(infoXml, 'poster_src');
    const isAdult = xmlTagText(infoXml, 'is_adult_content');
    let ageLimit: number | undefined;
    if (isAdult != null) ageLimit = isAdult === '1' ? 18 : 0;

    return {
      id: videoId,
      title,
      thumbnail: poster ? protoRelative(poster) : undefined,
      duration: int_or_none(xmlTagText(infoXml, 'duration')) ?? undefined,
      age_limit: ageLimit,
      formats,
    };
  }
}

/** TarangPlus family ù?ported from yt-dlp tarangplus.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, url_or_none } from '../../utils';
import { hiddenInputs, urljoin } from './_helpers';

const BASE_URL = 'https://tarangplus.in';
const ZERO_IV = new Uint8Array(16);

async function aesCbcDecrypt(dataB64: string, keyB64: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const dataBytes = Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ZERO_IV }, cryptoKey, dataBytes);
  return new TextDecoder().decode(plain);
}

export class TarangPlusBaseIE extends InfoExtractor {
  static IE_NAME = 'tarangplusbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TarangPlusBaseIE is not a standalone extractor', { expected: true });
  }
}

export class TarangPlusVideoIE extends TarangPlusBaseIE {
  static IE_NAME = 'tarangplus:video';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?tarangplus\.in\/(?:movies|[^#?/]+\/[^#?/]+)\/(?!episodes)(?<id>[^#?/]+)/;

  protected async decrypt(data: string, key: string): Promise<string> {
    try {
      return await aesCbcDecrypt(data, key);
    } catch (e) {
      throw new ExtractorError('AES decrypt failed (Web Crypto required)', { expected: true, cause: e });
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const hidden = hiddenInputs(webpage);
    const jsonLd = this._search_json_ld(webpage, displayId, { fatal: false }) || {};
    delete (jsonLd as Record<string, unknown>).url;

    const iframeMatch = webpage.match(/<iframe[^>]+src=["']([^"']+[?&]contenturl=[^"']+)["']/i);
    if (!iframeMatch?.[1]) throw new ExtractorError('Unable to find iframe URL', { expected: true });
    const iframeUrl = iframeMatch[1];
    const content = this._search_regex(/[?&]contenturl=(.+)/, iframeUrl, 'content')!;
    const pipeIdx = content.indexOf('|');
    const encryptedData = pipeIdx >= 0 ? content.slice(0, pipeIdx) : content;
    const attrs = pipeIdx >= 0 ? content.slice(pipeIdx + 1) : '';
    const metadata: Record<string, string> = {};
    for (const m of attrs.matchAll(/(?:^|\|)(?<k>[a-z_]+)=(?<v>(?:(?!\|[a-z_]+=).)+)/g)) {
      metadata[m.groups!.k!] = m.groups!.v!;
    }
    const m3u8Url = decodeURIComponent((await this.decrypt(encryptedData, metadata.key!)).replace(/[\x0e\x0f]+$/g, ''));

    const formats: Format[] = await this._extract_m3u8_formats(m3u8Url, displayId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');
    const genre = hidden.genre;

    return {
      id: metadata.content_id || displayId,
      display_id: displayId,
      ...jsonLd,
      title: metadata.title || (jsonLd as { title?: string }).title,
      thumbnail: url_or_none(metadata.image) ?? undefined,
      media_type: hidden.theme_type || undefined,
      categories: genre ? [genre] : undefined,
      formats,
    };
  }
}

export class TarangPlusEpisodesIE extends TarangPlusBaseIE {
  static IE_NAME = 'tarangplus:episodes';
  static _VALID_URL = /https?:\/\/(?:www\.)?tarangplus\.in\/(?<type>[^#?/]+)\/(?<id>[^#?/]+)\/episodes\/?(?:$|[?#])/;
  static _PAGE_SIZE = 20;

  protected async *_entries(playlistUrl: string, playlistId: string, page: number): AsyncGenerator<VideoInfo> {
    const data = await this._download_json<{ items?: string[] }>(playlistUrl, playlistId, `Downloading playlist JSON page ${page + 1}`, {
      query: { page_no: String(page) },
    });
    for (const item of data.items || []) {
      const parts = item.split('$');
      const path = parts[3];
      if (path) yield this.url_result(urljoin(BASE_URL, path), 'TarangPlusVideo');
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const urlType = m.groups!.type!;
    const displayId = m.groups!.id!;
    const seriesUrl = `${BASE_URL}/${urlType}/${displayId}`;
    const webpage = await this._download_webpage(seriesUrl, displayId);

    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      let count = 0;
      for await (const entry of this._entries(`${seriesUrl}/episodes`, displayId, page)) {
        entries.push(entry);
        count++;
      }
      if (count < TarangPlusEpisodesIE._PAGE_SIZE) break;
    }
    return this.playlist_result(entries, displayId, hiddenInputs(webpage).title);
  }
}

export class TarangPlusPlaylistIE extends TarangPlusBaseIE {
  static IE_NAME = 'tarangplus:playlist';
  static _VALID_URL = /https?:\/\/(?:www\.)?tarangplus\.in\/(?<id>[^#?/]+)\/all\/?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(/<a[^>]+href=["'](\/[^"']+)["']/gi)) {
      const href = m[1];
      if (href && /^\/[^/]/.test(href) && !href.includes('/all')) {
        entries.push(this.url_result(urljoin(BASE_URL, href), 'TarangPlusVideo'));
      }
    }
    const titleMatch = webpage.match(/id=["']al_title["'][^>]*>([\s\S]*?)<\//i);
    return this.playlist_result(entries, displayId, titleMatch ? clean_html(titleMatch[1]!) : undefined);
  }
}

/** ShemarooMeIE — ported from yt-dlp shemaroome.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { unified_strdate } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

async function aesCbcDecrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data);
  return new Uint8Array(decrypted);
}

function unpadPkcs7(data: Uint8Array): Uint8Array {
  const pad = data[data.length - 1]!;
  return data.slice(0, data.length - pad);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export class ShemarooMeIE extends InfoExtractor {
  static IE_NAME = 'shemaroome';
  static _VALID_URL = /https?:\/\/(?:www\.)?shemaroome\.com\/(?:movies|shows)\/(?<id>[^?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url).replace(/\//g, '_');
    const webpage = await this._download_webpage(url, videoId);
    const title = this._search_regex(/id=\"ma_title\" value=\"([^\"]+)/, webpage, 'title')!;
    const thumbnail = this._og_search_thumbnail(webpage) || undefined;
    const contentDef = this._search_regex(/id=\"content_definition\" value=\"([^\"]+)/, webpage, 'content_def')!;
    const catalogId = this._search_regex(/id=\"catalog_id\" value=\"([^\"]+)/, webpage, 'catalog_id')!;
    const itemCategory = this._search_regex(/id=\"item_category\" value=\"([^\"]+)/, webpage, 'item_category')!;
    const contentId = this._search_regex(/id=\"content_id\" value=\"([^\"]+)/, webpage, 'content_id')!;

    const data = `catalog_id=${catalogId}&content_id=${contentId}&category=${itemCategory}&content_def=${contentDef}`;
    const dataJson = await this._download_json<Record<string, unknown>>(
      'https://www.shemaroome.com/users/user_all_lists',
      videoId,
      undefined,
      { method: 'POST', data },
    );
    if (!dataJson.status) {
      throw new ExtractorError('Premium videos cannot be downloaded yet.', { expected: true });
    }

    const urlData = b64ToBytes(String(dataJson.new_play_url));
    const key = b64ToBytes(String(dataJson.key));
    const iv = new Uint8Array(16);
    const m3u8Url = new TextDecoder().decode(unpadPkcs7(await aesCbcDecrypt(urlData, key, iv)));
    const headers = { stream_key: String(dataJson.stream_key) };

    const { formats, subtitles: m3u8Subs } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');
    for (const fmt of formats) fmt.http_headers = headers;

    const releaseDate = this._html_search_regex(
      [/<meta itemprop="uploadDate">\s*([\d-]+)/, /id="release_date" value="([\d-]+)/],
      webpage,
      'release date',
      null,
      false,
    );

    const subtitles: Record<string, Subtitle[]> = {};
    const subUrl = dataJson.subtitle as string | undefined;
    if (subUrl) subtitles.EN = [{ url: subUrl.startsWith('//') ? `https:${subUrl}` : subUrl, ext: 'vtt' }];

    const description = this._html_search_regex(/>Synopsis([\s\S]+?)<\//, webpage, 'description', null, false) || undefined;

    return {
      id: videoId,
      formats,
      title,
      thumbnail,
      release_date: unified_strdate(releaseDate) ?? undefined,
      description,
      subtitles: mergeSubtitles(subtitles, m3u8Subs),
    };
  }
}

/**
 * FptplayIE ??ported from yt-dlp fptplay.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html } from '../../utils';
import { md5Hex } from '../hand-a/helpers';
import { extractM3u8FormatsAndSubtitles, stripOrNone } from './_helpers';

function convertStToken(hexMd5: string): string {
  const r = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const n: number[] = [];
  for (let o = 0; o < hexMd5.length / 2; o++) {
    n.push(parseInt(hexMd5.slice(2 * o, 2 * o + 2), 16));
  }
  let out = '';
  let idx = 0;
  const buf = [0, 0, 0];
  let a = [0, 0, 0, 0];
  let c = 0;
  for (let rem = n.length; rem > 0; rem--) {
    if (idx <= 3) buf[idx] = n[c]!;
    idx += 1;
    c += 1;
    if (idx === 3) {
      a[0] = (252 & buf[0]!) >> 2;
      a[1] = ((3 & buf[0]!) << 4) + ((240 & buf[1]!) >> 4);
      a[2] = ((15 & buf[1]!) << 2) + ((192 & buf[2]!) >> 6);
      a[3] = 63 & buf[2]!;
      for (const v of a) out += r[v]!;
      idx = 0;
    }
  }
  if (idx) {
    for (let o = idx; o < 3; o++) buf[o] = 0;
    for (let o = 0; o < idx + 1; o++) {
      a[0] = (252 & buf[0]!) >> 2;
      a[1] = ((3 & buf[0]!) << 4) + ((240 & buf[1]!) >> 4);
      a[2] = ((15 & buf[1]!) << 2) + ((192 & buf[2]!) >> 6);
      a[3] = 63 & buf[2]!;
      out += r[a[o]!]!;
    }
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export class FptplayIE extends InfoExtractor {
  static IE_NAME = 'fptplay';
  static IE_DESC = 'fptplay.vn';
  static _VALID_URL =
    /https?:\/\/fptplay\.vn\/xem-video\/[^/]+-(?<id>\w+)(?:\/tap-(?<episode>\d+)?\/?(?:[?#]|$)|)/;

  protected buildApiUrl(videoId: string, episode: number): string {
    const path = `/api/v6.2_w/stream/vod/${videoId}/${episode}/auto_vip`;
    const timestamp = Math.floor(Date.now() / 1000) + 10800;
    const digest = md5Hex(`WEBv6Dkdsad90dasdjlALDDDS${timestamp}${path}`).toUpperCase();
    const st = convertStToken(digest);
    return `https://api.fptplay.net${path}?st=${st}&e=${timestamp}`;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const slugEpisode = m.groups!.episode;
    const webpage = await this._download_webpage(url, videoId, undefined, { fatal: false });
    let title = this._search_regex(
      /<h4\s+class="mb-1 text-2xl text-white"[^>]*>(.+)<\/h4>/s,
      webpage,
      'title',
      null,
      false,
    );
    const realEpisode =
      slugEpisode && !title
        ? slugEpisode
        : this._search_regex(
            /<p.+title="(?<episode>[^">]+)"\s+class="epi-title active"/,
            webpage,
            'episode',
            'episode',
            false,
          );
    title =
      stripOrNone(title) ||
      this._html_search_meta('og:title', webpage, undefined, false) ||
      videoId;

    const info = await this._download_json<{ data?: { url?: string } }>(
      this.buildApiUrl(videoId, slugEpisode ? Number(slugEpisode) - 1 : 0),
      videoId,
    );
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      info.data?.url || '',
      videoId,
    );

    const descMatch = webpage.match(/<p\s+class="overflow-hidden"[^>]*>(.+)<\/p>/);
    return {
      id: videoId,
      title: [title, realEpisode].filter(Boolean).join(' - '),
      description:
        (descMatch ? clean_html(descMatch[1]) : null) ||
        this._html_search_meta('og:description', webpage, undefined, false) ||
        undefined,
      formats,
      subtitles,
    };
  }
}

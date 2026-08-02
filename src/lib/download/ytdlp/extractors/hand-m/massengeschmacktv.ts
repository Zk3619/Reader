/** MassengeschmackTVIE — ported from yt-dlp massengeschmacktv.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, determine_ext, int_or_none, js_to_json, mimetype2ext, parse_filesize } from '../../utils';
import { protoRelative } from './_helpers';

export class MassengeschmackTVIE extends InfoExtractor {
  static IE_NAME = 'massengeschmack.tv';
  static _VALID_URL = /https?:\/\/(?:www\.)?massengeschmack\.tv\/play\/(?<id>[^?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const episode = this._match_id(url);
    const webpage = await this._download_webpage(url, episode);
    const sources =
      this._parse_json<Array<Record<string, unknown>>>(
        js_to_json(this._search_regex(/MEDIA\s*=\s*(\[[\s\S]+?\]);/, webpage, 'media')!),
        episode,
      ) || [];

    const formats: Format[] = [];
    for (const source of sources) {
      let furl = protoRelative(String(source.src ?? ''));
      if (!furl) continue;
      const ext = determine_ext(furl) || mimetype2ext(String(source.type ?? '')) || '';
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(furl, episode, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else {
        formats.push({ url: furl, format_id: determine_ext(furl) || 'http' });
      }
    }

    for (const m of webpage.matchAll(
      /<a[^>]+?href="(?<url>(?:https:)?\/\/[^"]+)".*?<strong>(?<format_id>.+?)<\/strong>.*?(?:(?<width>\d+)x(?<height>\d+))?\s*?\((?<filesize>[\d,]+\s*[GM]iB)\)<\/small>/gi,
    )) {
      formats.push({
        url: m.groups!.url!,
        format_id: m.groups!.format_id!,
        width: int_or_none(m.groups!.width) ?? undefined,
        height: int_or_none(m.groups!.height) ?? undefined,
        filesize: parse_filesize(m.groups!.filesize) ?? undefined,
        vcodec: m.groups!.format_id!.startsWith('Audio') ? 'none' : undefined,
      });
    }

    return {
      id: episode,
      title:
        clean_html(
          this._html_search_regex(/<span[^>]+\bid=["']clip-title["'][^>]*>([^<]+)/, webpage, 'title', null, false),
        ) ?? undefined,
      formats,
      thumbnail:
        this._search_regex(/POSTER\s*=\s*"([^"]+)/, webpage, 'thumbnail', null, false) ?? undefined,
    };
  }
}

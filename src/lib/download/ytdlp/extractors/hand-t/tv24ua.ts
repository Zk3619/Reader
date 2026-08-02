/**
 * TV24UAVideoIE — ported from yt-dlp tv24ua.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext, js_to_json, mimetype2ext, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class TV24UAVideoIE extends InfoExtractor {
  static IE_NAME = '24tv.ua';
  static _VALID_URL =
    /https?:\/\/24tv\.ua\/news\/showPlayer\.do.*?(?:\?|&)objectId=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    for (const j of webpage.matchAll(/vPlayConfig\.sources\s*=\s*(?<json>\[{[\s\S]*?}])/g)) {
      const sources =
        this._parse_json<Record<string, unknown>[]>(j.groups?.json || '[]', videoId, js_to_json, false) || [];
      for (const source of sources) {
        const src = source.src != null ? String(source.src) : '';
        if (!src) continue;
        if (mimetype2ext(source.type != null ? String(source.type) : undefined) === 'm3u8') {
          const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(this, src, videoId);
          formats.push(...fmts);
          mergeSubtitles(subtitles, subs);
        } else {
          formats.push({ url: src, ext: determine_ext(src), format_id: determine_ext(src) });
        }
      }
    }

    const thumbJson = this._search_regex(
      /var\s*vPlayConfig\s*=\s*/,
      webpage,
      'thumbnail',
      null,
      false,
    );
    let thumbnail: string | undefined;
    if (thumbJson) {
      const cfg = this._parse_json<Record<string, unknown>>(thumbJson, videoId, js_to_json, false);
      thumbnail = traverse_obj(cfg, ['poster']) != null ? String(traverse_obj(cfg, ['poster'])) : undefined;
    }

    return {
      id: videoId,
      formats,
      subtitles,
      thumbnail: thumbnail || this._og_search_thumbnail(webpage) || undefined,
      title:
        this._og_search_title(webpage, false) ||
        this._html_search_regex(/<title[^>]*>([^<]+)<\/title>/i, webpage, 'title', null, false) ||
        videoId,
      description: this._og_search_description(webpage) || undefined,
    };
  }
}

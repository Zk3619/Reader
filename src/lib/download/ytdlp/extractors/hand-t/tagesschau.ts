/** TagesschauIE — ported from yt-dlp tagesschau.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { extract_attributes, int_or_none, js_to_json, try_get } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601 } from './_helpers';

export class TagesschauIE extends InfoExtractor {
  static IE_NAME = 'tagesschau';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?tagesschau\.de\/(?<path>[^/]+\/(?:[^/]+\/)*?(?<id>[^/#?]+?(?:-?[0-9]+)?))(?:~_?[^/#?]+?)?\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let videoId = m.groups?.id || m.groups?.path || '';
    const displayId = videoId.replace(/^-/, '');

    const webpage = await this._download_webpage(url, displayId);
    const title =
      this._html_search_regex(/<span[^>]*class="headline"[^>]*>(.+?)<\/span>/, webpage, 'title', null, false) ||
      this._og_search_title(webpage, false);

    const entries: VideoInfo[] = [];
    let num = 0;
    for (const divMatch of webpage.matchAll(/<div[^>]+>/g)) {
      const attrs = extract_attributes(divMatch[0]);
      const rawConfig = attrs['data-config'];
      if (!rawConfig) continue;
      const video = this._parse_json(rawConfig, videoId, js_to_json, false) as Record<string, unknown>;
      const videoFormats = try_get(video, (x) => (x as { mc?: { _mediaArray?: Array<{ _mediaStreamArray?: unknown[] }> } }).mc?._mediaArray?.[0]?._mediaStreamArray) as
        | Array<{ _stream?: string }>
        | undefined;
      if (!videoFormats?.length) continue;
      num += 1;
      for (const videoFormat of videoFormats) {
        const mediaUrl = videoFormat._stream || '';
        let formats: Format[] = [];
        if (mediaUrl.endsWith('master.m3u8')) {
          formats = (await extractM3u8FormatsAndSubtitles(this, mediaUrl, videoId, 'hls')).formats;
        } else if (mediaUrl.endsWith('.mp3')) {
          formats = [{ url: mediaUrl, vcodec: 'none', format_id: 'mp3' }];
        }
        if (!formats.length) continue;
        entries.push({
          id: `${displayId}-${num}`,
          title: try_get(video, (x) => (x as { mc?: { _title?: string } }).mc?._title) as string | undefined,
          duration: int_or_none(try_get(video, (x) => (x as { mc?: { _duration?: unknown } }).mc?._duration)) ?? undefined,
          formats,
        });
      }
    }

    if (!entries.length) {
      throw new ExtractorError(`Unsupported URL: ${url}`, { expected: true });
    }
    if (entries.length > 1) {
      return this.playlist_result(entries, displayId, title || undefined);
    }
    return {
      id: displayId,
      title: title || displayId,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      formats: entries[0]!.formats,
      timestamp: parseIso8601(this._html_search_meta('date', webpage)) ?? undefined,
      description: this._og_search_description(webpage) ?? undefined,
      duration: entries[0]!.duration,
    };
  }
}

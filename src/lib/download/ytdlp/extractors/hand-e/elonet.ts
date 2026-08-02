/**
 * ElonetIE — ported from yt-dlp elonet.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class ElonetIE extends InfoExtractor {
  static IE_NAME = 'elonet';
  static _VALID_URL =
    /https?:\/\/elonet\.finna\.fi\/Record\/kavi\.elonet_elokuva_(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const jsonRaw = this._html_search_regex(
      /id='video-data'[^>]+data-video-sources="([^"]+)"/,
      webpage,
      'json',
    )!;
    const sources = this._parse_json<Array<{ src: string }>>(jsonRaw, videoId)!;
    const src = sources[0]!.src;
    const ext = determine_ext(src);

    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    if (ext === 'm3u8') {
      const res = await extractM3u8FormatsAndSubtitles(this, src, videoId, 'hls');
      formats = res.formats;
      subtitles = res.subtitles;
    } else if (ext === 'mpd') {
      formats = await this._extract_mpd_formats(src, videoId, 'dash', undefined, false);
    } else {
      this.raise_no_formats(`Unknown streaming format ${ext}`);
    }

    return {
      id: videoId,
      title: this._og_search_title(webpage) ?? undefined,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      formats,
      subtitles,
    };
  }
}

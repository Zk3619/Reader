/**
 * DaystarClipIE — ported from yt-dlp daystar.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { js_to_json } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, urljoin } from './_helpers';

export class DaystarClipIE extends InfoExtractor {
  static IE_NAME = 'daystar:clip';
  static _VALID_URL = /https?:\/\/player\.daystar\.tv\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const srcIframe = this._search_regex(/<iframe[^>]+src="([^"]+)"/, webpage, 'src iframe')!;
    const webpageIframe = await this._download_webpage(
      srcIframe.replace('player.php', 'config2.php'),
      videoId,
      undefined,
      { headers: { Referer: srcIframe } },
    );

    const sources = this._parse_json<Array<Record<string, unknown>>>(
      this._search_regex(/sources\s*:\s*(\[.*?\])/, webpageIframe, 'm3u8 source')!,
      videoId,
      js_to_json,
    )!;

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    for (const source of sources) {
      const file = source.file as string | undefined;
      if (file && source.type === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(
          this,
          urljoin('https://www.lightcast.com/embed/', file),
          videoId,
          'hls',
        );
        formats.push(...res.formats);
        subtitles = mergeSubtitles(subtitles, res.subtitles);
      }
    }

    return {
      id: videoId,
      title: this._html_search_meta(['og:title', 'twitter:title'], webpage) ?? undefined,
      description: this._html_search_meta(['og:description', 'twitter:description'], webpage) ?? undefined,
      thumbnail: this._search_regex(/image:\s*"([^"]+)/, webpageIframe, 'thumbnail', null, false) ?? undefined,
      formats,
      subtitles,
    };
  }
}

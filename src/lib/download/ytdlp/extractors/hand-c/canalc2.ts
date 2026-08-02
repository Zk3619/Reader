/**
 * Canalc2IE — ported from yt-dlp canalc2.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { parse_duration } from '../../utils';
import { parseHtml5MediaEntries } from './_helpers';

export class Canalc2IE extends InfoExtractor {
  static IE_NAME = 'canalc2.tv';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?canalc2\.tv\/video\/|archives-canalc2\.u-strasbg\.fr\/video\.asp\?.*\bidVideo=)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const webpage = await this._download_webpage(`http://www.canalc2.tv/video/${videoId}`, videoId);

    const title = this._html_search_regex(
      /(?:[\s\S])*?class="[^"]*col_description[^"]*">[\s\S]*?<h3>(.+?)<\/h3>/,
      webpage,
      'title',
    )!;

    let formats: Format[] = [];
    for (const m of webpage.matchAll(/file\s*=\s*(["'])(.+?)\1/g)) {
      const videoUrl = m[2]!;
      if (videoUrl.startsWith('rtmp://')) {
        const rtmp = videoUrl.match(/^(?<url>rtmp:\/\/[^/]+\/(?<app>.+\/))(?<play_path>mp4:.+)$/);
        if (rtmp) {
          formats.push({
            url: rtmp.groups!.url!,
            format_id: 'rtmp',
            ext: 'flv',
            app: rtmp.groups!.app,
            play_path: rtmp.groups!.play_path,
            page_url: url,
          });
        }
      } else {
        formats.push({ url: videoUrl, format_id: 'http' });
      }
    }

    if (!formats.length) {
      const entries = await parseHtml5MediaEntries(this, url, webpage, videoId);
      formats = entries[0]?.formats || [];
    }

    return {
      id: videoId,
      title,
      duration:
        parse_duration(
          this._search_regex(/id=["\']video_duree["\'][^>]*>([^<]+)/, webpage, 'duration', null, false),
        ) ?? undefined,
      formats,
    };
  }
}

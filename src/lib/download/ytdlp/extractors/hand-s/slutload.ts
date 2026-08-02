/** SlutloadIE — ported from yt-dlp slutload.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parseHtml5MediaEntries } from './_helpers';

export class SlutloadIE extends InfoExtractor {
  static IE_NAME = 'slutload';
  static _VALID_URL =
    /https?:\/\/(?:\w+\.)?slutload\.com\/(?:video\/[^/]+|embed_player|watch)\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const embedPage = await this._download_webpage(
      `http://www.slutload.com/embed_player/${videoId}`,
      videoId,
      'Downloading embed page',
      { fatal: false },
    );

    if (embedPage) {
      const extract = (what: string): string | null =>
        this._html_search_regex(
          new RegExp(`data-video-${what}=(["'])(?<url>(?:(?!\\1).)+)\\1`),
          embedPage,
          `video ${what}`,
          null,
          false,
          'url',
        );

      const videoUrl = extract('url');
      if (videoUrl) {
        const title =
          this._html_search_regex(/<title>([^<]+)/, embedPage, 'title', videoId, false) || videoId;
        return {
          id: videoId,
          url: videoUrl,
          title,
          thumbnail: extract('preview') || undefined,
          age_limit: 18,
        };
      }
    }

    const webpage = await this._download_webpage(`http://www.slutload.com/video/_/${videoId}/`, videoId);
    const title = this._html_search_regex(/<h1><strong>([^<]+)<\/strong>/, webpage, 'title')!.trim();
    const entries = await parseHtml5MediaEntries(this, url, webpage, videoId);
    const info = { ...entries[0]!, id: videoId, title, age_limit: 18 };
    return info;
  }
}

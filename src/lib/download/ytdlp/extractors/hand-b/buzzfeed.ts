/**
 * BuzzFeedIE — aligned with yt-dlp buzzfeed.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class BuzzFeedIE extends InfoExtractor {
  static IE_NAME = 'buzzfeed';
  static _VALID_URL = /https?:\/\/(?:www\.)?buzzfeed\.com\/[^?#]*?\/(?<id>[^?#]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);

    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(
      /<div class="video-embed[^"]*"[\s\S]*?rel:bf_bucket_data='([^']+)'/g,
    )) {
      let bd: Record<string, unknown>;
      try {
        bd = JSON.parse(m[1]!);
      } catch {
        continue;
      }
      const video = (bd.video || bd.progload_video) as Record<string, unknown> | undefined;
      if (!video?.url) continue;
      entries.push(this.url_result(String(video.url)));
    }

    for (const m of webpage.matchAll(
      /https?:\/\/(?:www\.)?facebook\.com\/(?:video\.php|[^/]+\/videos)\/[^"'\s]+/g,
    )) {
      entries.push(this.url_result(m[0]));
    }

    return {
      _type: 'playlist',
      id: playlistId,
      title: this._og_search_title(webpage) || playlistId,
      description: this._og_search_description(webpage),
      entries,
      webpage_url: url,
      original_url: url,
      extractor: 'buzzfeed',
      extractor_key: 'BuzzFeed',
    };
  }
}

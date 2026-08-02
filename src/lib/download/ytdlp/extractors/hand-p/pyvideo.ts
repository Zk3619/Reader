/** PyvideoIE — ported from yt-dlp pyvideo.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class PyvideoIE extends InfoExtractor {
  static IE_NAME = 'pyvideo';
  static _VALID_URL = /https?:\/\/(?:www\.)?pyvideo\.org\/(?<category>[^/]+)\/(?<id>[^/?#&.]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const category = m.groups?.category ?? '';
    const videoId = m.groups?.id ?? '';
    const entries: VideoInfo[] = [];

    const data = await this._download_json<Record<string, unknown>>(
      `https://raw.githubusercontent.com/pyvideo/data/master/${category}/videos/${videoId}.json`,
      videoId,
      undefined,
      { fatal: false },
    );

    if (data) {
      for (const video of (data.videos as Array<Record<string, unknown>>) || []) {
        const videoUrl = video.url as string | undefined;
        if (!videoUrl) continue;
        if (video.type === 'youtube') {
          entries.push(this.url_result(videoUrl, 'Youtube'));
        } else {
          entries.push({
            id: String(data.id ?? videoId),
            url: videoUrl,
            title: String(data.title ?? ''),
            description: ((data.description || data.summary) as string) ?? undefined,
            thumbnail: (data.thumbnail_url as string) ?? undefined,
            duration: int_or_none(data.duration) ?? undefined,
          });
        }
      }
    } else {
      const webpage = await this._download_webpage(url, videoId);
      const title = this._og_search_title(webpage) || undefined;
      const mediaUrls = this._search_regex(/Media URL:([\s\S]*?)<\/li>/, webpage, 'media urls')!;
      for (const mm of mediaUrls.matchAll(/<a[^>]+href=(["'])(?<url>http.+?)\1/gi)) {
        const mediaUrl = mm.groups?.url ?? '';
        if (/^https?:\/\/www\.youtube\.com\/watch\?v=/.test(mediaUrl)) {
          entries.push(this.url_result(mediaUrl, 'Youtube'));
        } else {
          entries.push({ id: videoId, url: mediaUrl, title });
        }
      }
    }

    return this.playlist_result(entries, videoId);
  }
}

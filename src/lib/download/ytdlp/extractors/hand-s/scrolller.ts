/** ScrolllerIE — ported from yt-dlp scrolller.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { determine_ext, int_or_none } from '../../utils';

export class ScrolllerIE extends InfoExtractor {
  static IE_NAME = 'scrolller';
  static _VALID_URL = /https?:\/\/(?:www\.)?scrolller\.com\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const query = {
      query: `{ getSubredditPost(url:"/${videoId}"){ id title isNsfw mediaSources{ url width height } } }`,
    };
    const resp = await this._download_json<{ data?: { getSubredditPost?: Record<string, unknown> } }>(
      'https://api.scrolller.com/api/v2/graphql',
      videoId,
      undefined,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(query),
      },
    );
    const videoData = resp.data?.getSubredditPost || {};
    const formats: Format[] = [];
    const thumbnails: Thumbnail[] = [];
    for (const source of (videoData.mediaSources as Array<Record<string, unknown>>) || []) {
      const srcUrl = source.url as string | undefined;
      if (!srcUrl) continue;
      if (['jpg', 'png'].includes(determine_ext(srcUrl))) {
        thumbnails.push({
          url: srcUrl,
          width: int_or_none(source.width) ?? undefined,
          height: int_or_none(source.height) ?? undefined,
        });
      } else {
        formats.push({
          url: srcUrl,
          format_id: `http-${formats.length}`,
          width: int_or_none(source.width) ?? undefined,
          height: int_or_none(source.height) ?? undefined,
        });
      }
    }
    if (!formats.length) {
      throw new ExtractorError('There is no video.', { expected: true });
    }
    return {
      id: videoId,
      title: videoData.title as string | undefined,
      thumbnails,
      formats,
      age_limit: videoData.isNsfw ? 18 : 0,
    };
  }
}

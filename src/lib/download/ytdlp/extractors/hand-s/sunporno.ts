/** SunPornoIE — ported from yt-dlp sunporno.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, parse_duration } from '../../utils';
import { htmlExtractTitle, qualityRank } from './_helpers';

export class SunPornoIE extends InfoExtractor {
  static IE_NAME = 'sunporno';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?sunporno\.com\/videos|embeds\.sunporno\.com\/embed)\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`http://www.sunporno.com/videos/${videoId}`, videoId);
    const title = htmlExtractTitle(webpage) || videoId;
    const description = this._html_search_meta('description', webpage, 'description') || undefined;
    const thumbnail =
      this._html_search_regex(/poster="([^"]+)"/, webpage, 'thumbnail', null, false) || undefined;
    const duration =
      parse_duration(
        this._search_regex(
          [
            /itemprop="duration"[^>]*>\s*(\d+:\d+)\s*</,
            />Duration:\s*<span[^>]+>\s*(\d+:\d+)\s*</,
          ],
          webpage,
          'duration',
          null,
          false,
        ),
      ) ?? undefined;
    const viewCount =
      int_or_none(
        this._html_search_regex(/class="views">(?:<noscript>)?\s*(\d+)\s*</, webpage, 'view count', null, false),
      ) ?? undefined;
    const commentCount =
      int_or_none(
        this._html_search_regex(/(\d+)<\/b> Comments?/, webpage, 'comment count', null, false),
      ) ?? undefined;
    const quality = qualityRank(['mp4', 'flv']);
    const formats: Format[] = [];
    for (const m of webpage.matchAll(/<(?:source|video) src="([^"]+)"/g)) {
      const videoUrl = m[1]!;
      const videoExt = determine_ext(videoUrl);
      formats.push({
        url: videoUrl,
        format_id: videoExt,
        quality: quality(videoExt),
      });
    }
    return {
      id: videoId,
      title,
      description,
      thumbnail,
      duration,
      view_count: viewCount,
      comment_count: commentCount,
      formats,
      age_limit: 18,
    };
  }
}

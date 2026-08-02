/**
 * FiveTVIE ??ported from yt-dlp fivetv.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class FiveTVIE extends InfoExtractor {
  static IE_NAME = 'fivetv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?5-tv\.ru\/(?:(?:[^/]+\/)+(?<id>\d+)|(?<path>[^/?#]+)(?:[/?#])?)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id || m.groups!.path!;
    const webpage = await this._download_webpage(url, videoId);
    const videoUrl = this._search_regex(
      [
        /<div[^>]+?class="(?:flow)?player[^>]+?data-href="([^"]+)"/,
        /<a[^>]+?href="([^"]+)"[^>]+?class="videoplayer"/,
      ],
      webpage,
      'video url',
    )!;
    const title = this._og_search_title(webpage) || videoId;
    const duration = int_or_none(this._og_search_property('video:duration', webpage, 'duration', false));

    return {
      id: videoId,
      url: videoUrl,
      title,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      duration: duration ?? undefined,
    };
  }
}

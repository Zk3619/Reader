// @ts-nocheck
/** VideoKenPlayerIE â€?ported from yt-dlp videoken.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { remove_start, update_url_query, url_or_none } from '../../utils';

export class VideoKenPlayerIE extends InfoExtractor {
  static IE_NAME = 'videoken:player';
  static _VALID_URL = /https?:\/\/player\.videoken\.com\/embed\/slideslive-(?<id>\d+)/;

  protected _createSlidesliveUrl(
    videoUrl: string | null | undefined,
    videoId: string | null | undefined,
    referer: string | null | undefined,
  ): string | undefined {
    if (!videoUrl && !videoId) return undefined;
    let resolved = videoUrl;
    if (!resolved || resolved.includes('embed/sign-in')) {
      resolved = `https://slideslive.com/embed/${remove_start(videoId || '', 'slideslive-') || ''}`;
    }
    if (url_or_none(referer)) {
      let hostname = '';
      try {
        hostname = new URL(referer!).hostname;
      } catch {
        hostname = '';
      }
      return update_url_query(resolved!, {
        embed_parent_url: referer!,
        embed_container_origin: `https://${hostname}`,
      });
    }
    return resolved || undefined;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this.url_result(
      this._createSlidesliveUrl(null, videoId, url) || `https://slideslive.com/embed/${videoId}`,
      'SlidesLive',
      videoId,
    );
  }
}

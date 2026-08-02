/** ParlerIE — ported from yt-dlp parler.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none, unified_timestamp, url_or_none } from '../../utils';
import { strip_or_none } from './_helpers';

export class ParlerIE extends InfoExtractor {
  static IE_NAME = 'parler';
  static _VALID_URL =
    /https?:\/\/parler\.com\/feed\/(?<id>[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = (await this._download_json<{ data: Record<string, unknown> }>(
      `https://api.parler.com/v0/public/parleys/${videoId}`,
      videoId,
    )).data;

    if (data.link) {
      return this.url_result(String(data.link), 'Youtube');
    }

    const video = (data.video as Record<string, unknown>) || {};
    const user = (data.user as Record<string, unknown>) || {};
    const username = str_or_none(user.username);
    return {
      id: videoId,
      title: strip_or_none(data.title) || '',
      url: url_or_none(video.videoSrc) ?? undefined,
      thumbnail: url_or_none(video.thumbnailUrl) ?? undefined,
      description: clean_html(str_or_none(data.body)) ?? undefined,
      timestamp: unified_timestamp(data.date_created) ?? undefined,
      uploader: strip_or_none(user.name) ?? undefined,
      uploader_id: username ?? undefined,
      uploader_url: username ? `https://parler.com/${username}` : undefined,
      view_count: int_or_none(data.views) ?? undefined,
      comment_count: int_or_none(data.total_comments) ?? undefined,
      repost_count: int_or_none(data.echos) ?? undefined,
    };
  }
}

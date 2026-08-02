/**
 * HitRecordIE — ported from yt-dlp hitrecord.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, float_or_none, int_or_none, try_get } from '../../utils';

export class HitRecordIE extends InfoExtractor {
  static IE_NAME = 'hitrecord';
  static _VALID_URL = /https?:\/\/(?:www\.)?hitrecord\.org\/records\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const video = await this._download_json<Record<string, unknown>>(
      `https://hitrecord.org/api/web/records/${videoId}`,
      videoId,
    );

    const title = String(video.title ?? videoId);
    const sourceUrl = (video.source_url as Record<string, unknown>) || {};
    const videoUrl = String(sourceUrl.mp4_url ?? '');

    const tagsList = try_get(video, (x) => x.tags as unknown[], Array.isArray);
    let tags: string[] | undefined;
    if (tagsList) {
      tags = tagsList
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && typeof (t as { text?: unknown }).text === 'string')
        .map((t) => String(t.text));
      if (!tags.length) tags = undefined;
    }

    return {
      id: videoId,
      url: videoUrl,
      title,
      description: clean_html(video.body as string | undefined) ?? undefined,
      duration: float_or_none(video.duration, 1000) ?? undefined,
      timestamp: int_or_none(video.created_at_i) ?? undefined,
      uploader: try_get(video, (x) => String((x.user as Record<string, unknown>).username)) ?? undefined,
      uploader_id: try_get(video, (x) => String((x.user as Record<string, unknown>).id)) ?? undefined,
      view_count: int_or_none(video.total_views_count) ?? undefined,
      like_count: int_or_none(video.hearts_count) ?? undefined,
      comment_count: int_or_none(video.comments_count) ?? undefined,
      tags,
    };
  }
}

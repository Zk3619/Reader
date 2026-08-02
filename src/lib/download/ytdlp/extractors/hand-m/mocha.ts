/**
 * MochaVideoIE — ported from yt-dlp mocha.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class MochaVideoIE extends InfoExtractor {
  static IE_NAME = 'mocha';
  static _VALID_URL = /https?:\/\/video\.mocha\.com\.vn\/(?<video_slug>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoSlug = m.groups?.video_slug ?? '';
    const response = await this._download_json<{ data: { videoDetail: Record<string, unknown> } }>(
      'http://apivideo.mocha.com.vn:8081/onMediaBackendBiz/mochavideo/getVideoDetail',
      videoSlug,
      undefined,
      { query: { url, token: '' } },
    );
    const jsonData = response.data?.videoDetail || {};
    const videoId = String(jsonData.id ?? videoSlug);

    const videoUrls: unknown[] = [
      ...((jsonData.list_resolution as unknown[]) || []),
      jsonData.original_path,
    ].filter(Boolean);

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const video of videoUrls) {
      if (typeof video === 'string') {
        formats.push({ url: video, format_id: 'http', ext: 'mp4' });
      } else if (video && typeof video === 'object') {
        const rec = video as Record<string, unknown>;
        const res = await extractM3u8FormatsAndSubtitles(
          this,
          String(rec.video_path ?? ''),
          videoId,
          'hls',
        );
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      }
    }

    const channels = (jsonData.channels as Array<Record<string, unknown>>) || [];

    return {
      id: videoId,
      display_id: (jsonData.slug as string | undefined) || videoSlug,
      title: jsonData.name as string | undefined,
      formats,
      subtitles,
      description: jsonData.description as string | undefined,
      duration: jsonData.durationS as number | undefined,
      view_count: jsonData.total_view as number | undefined,
      like_count: jsonData.total_like as number | undefined,
      dislike_count: jsonData.total_unlike as number | undefined,
      thumbnail: jsonData.image_path_thumb as string | undefined,
      timestamp: int_or_none(jsonData.publish_time, 1000) ?? undefined,
      is_live: !!jsonData.isLive,
      channel: traverse_obj(channels, [0, 'name', { str: String }]) as string | undefined,
      channel_id: ((v) => (v == null ? undefined : String(v)))(traverse_obj(channels, [0, 'id'])),
      channel_follower_count: traverse_obj(channels, [0, 'numfollow', { int_or_none }]) as
        | number
        | undefined,
      categories: ((jsonData.categories as Array<Record<string, unknown>>) || [])
        .map((c) => c.categoryname)
        .filter(Boolean) as string[],
      comment_count: jsonData.total_comment as number | undefined,
    };
  }
}

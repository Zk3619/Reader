/**
 * TwentyMinutenIE — ported from yt-dlp twentymin.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, try_get } from '../../utils';

export class TwentyMinutenIE extends InfoExtractor {
  static IE_NAME = '20min';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?20min\.ch\/(?:videotv\/[^?]*?\bvid=|videoplayer\/videoplayer\.html\?[^?]*?\bvideoId@)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const payload = await this._download_json<{ content: Record<string, unknown> }>(
      `http://api.20min.ch/video/${videoId}/show`,
      videoId,
    );
    const video = payload.content;

    const formats: Format[] = [
      { format_id: 'sd', url: `http://podcast.20min-tv.ch/podcast/20min/${videoId}.mp4`, quality: 0 },
      { format_id: 'hd', url: `http://podcast.20min-tv.ch/podcast/20min/${videoId}h.mp4`, quality: 1 },
    ];

    const extractCount = (kind: string): number | undefined =>
      int_or_none(
        try_get(video, (x: Record<string, unknown>) => {
          const co = x.communityobject as Record<string, unknown> | undefined;
          return co?.[`thumbs_${kind}`];
        }) as unknown,
      ) ?? undefined;

    return {
      id: videoId,
      title: String(video.title || videoId),
      description: video.lead != null ? String(video.lead) : undefined,
      thumbnail: video.thumbnail != null ? String(video.thumbnail) : undefined,
      like_count: extractCount('up'),
      dislike_count: extractCount('down'),
      formats,
    };
  }
}

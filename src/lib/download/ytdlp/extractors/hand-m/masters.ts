/** MastersIE — ported from yt-dlp masters.py */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { traverse_obj, unified_strdate, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class MastersIE extends InfoExtractor {
  static IE_NAME = 'masters';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?masters\.com\/en_US\/watch\/(?<date>\d{4}-\d{2}-\d{2})\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const uploadDate = m.groups!.date!;
    const contentResp = await this._download_json<Record<string, unknown>>(
      `https://www.masters.com/relatedcontent/rest/v2/masters_v1/en/content/masters_v1_${videoId}_en`,
      videoId,
    );
    const m3u8 = url_or_none(traverse_obj(contentResp, ['media', 'm3u8']));
    const { formats, subtitles } = m3u8
      ? await extractM3u8FormatsAndSubtitles(this, m3u8, videoId, 'hls')
      : { formats: [], subtitles: {} };

    const images = (traverse_obj(contentResp, ['images', 0]) as Record<string, unknown>) || {};
    const thumbnails: Thumbnail[] = Object.entries(images)
      .map(([name, u]) => ({ id: name, url: url_or_none(u) || '' }))
      .filter((t) => t.url);

    return {
      id: videoId,
      title: contentResp.title as string | undefined,
      formats,
      subtitles,
      upload_date: unified_strdate(uploadDate) ?? undefined,
      thumbnails,
    };
  }
}

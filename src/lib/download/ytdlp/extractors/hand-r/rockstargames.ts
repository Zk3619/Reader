/** RockstarGamesIE — ported from yt-dlp rockstargames.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { parseIso8601, protoRelative } from './_helpers';

export class RockstarGamesIE extends InfoExtractor {
  static IE_NAME = 'RockstarGames';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?rockstargames\.com\/videos(?:\/video\/|#?\/?\?.*\bvideo=)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const resp = await this._download_json<{ video?: Record<string, unknown> }>(
      'https://www.rockstargames.com/videoplayer/videos/get-video.json',
      videoId,
      undefined,
      { query: { id: videoId, locale: 'en_us' } },
    );
    const video = resp.video || {};

    const formats: Format[] = [];
    const mp4Files = ((video.files_processed as Record<string, unknown>)?.['video/mp4'] as Array<Record<string, unknown>>) || [];
    for (const v of mp4Files) {
      if (!v.src) continue;
      const resolution = v.resolution as string | undefined;
      const height = int_or_none(
        this._search_regex(/^(\d+)[pP]$/, resolution || '', 'height', undefined, false),
      );
      formats.push({
        url: protoRelative(String(v.src)),
        format_id: resolution || 'mp4',
        height: height ?? undefined,
      });
    }

    if (!formats.length) {
      const youtubeId = video.youtube_id as string | undefined;
      if (youtubeId) return this.url_result(youtubeId, 'Youtube');
    }

    const screencap = video.screencap as string | undefined;
    return {
      id: videoId,
      title: video.title as string,
      description: video.description as string | undefined,
      thumbnail: screencap ? protoRelative(screencap) : undefined,
      timestamp: parseIso8601(video.created) ?? undefined,
      formats,
    };
  }
}

/**
 * DigitekaIE — ported from yt-dlp digiteka.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, str_or_none, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class DigitekaIE extends InfoExtractor {
  static IE_NAME = 'digiteka';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:digiteka\.net|ultimedia\.com)\/(?:deliver\/(?:generic|musique)(?:\/[^/]+)*\/(?:src|article)|default\/index\/video(?:generic|music)\/id)\/(?<id>[\da-z]+)/i;
  protected static _IFRAME_MD_ID = '01836272';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const conf = await this._download_json<{ video: Record<string, unknown> }>(
      `https://www.ultimedia.com/player/getConf/${DigitekaIE._IFRAME_MD_ID}/1/${videoId}`,
      videoId,
      'Downloading player configuration',
    );
    const videoInfo = conf.video;

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    const mediaSources = (videoInfo.media_sources as Record<string, unknown>) || {};
    const hls = (mediaSources.hls as Record<string, unknown>) || {};
    const hlsUrl = url_or_none(hls.hls_auto);
    if (hlsUrl) {
      const res = await extractM3u8FormatsAndSubtitles(this, hlsUrl, videoId, 'hls');
      formats.push(...res.formats);
      subtitles = mergeSubtitles(subtitles, res.subtitles);
    }

    const mp4Sources = mediaSources.mp4 as Record<string, string> | undefined;
    if (mp4Sources && typeof mp4Sources === 'object') {
      for (const [formatId, mp4Url] of Object.entries(mp4Sources)) {
        if (!mp4Url) continue;
        formats.push({
          url: mp4Url,
          format_id: formatId,
          height: int_or_none(formatId.split('_')[2]) ?? undefined,
          ext: 'mp4',
        });
      }
    }

    return {
      id: videoId,
      formats,
      subtitles,
      title: str_or_none(videoInfo.title) ?? undefined,
      thumbnail: url_or_none(videoInfo.image) ?? undefined,
      duration: int_or_none(videoInfo.duration) ?? undefined,
      timestamp: int_or_none(videoInfo.creationDate) ?? undefined,
      uploader_id: str_or_none(videoInfo.ownerId) ?? undefined,
    };
  }
}

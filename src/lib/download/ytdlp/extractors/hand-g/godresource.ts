/**
 * GodResourceIE — ported from yt-dlp godresource.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extractM3u8FormatsAndSubtitles } from './_helpers';
import { determine_ext, str_or_none, unified_timestamp, url_or_none, traverse_obj } from '../../utils';

export class GodResourceIE extends InfoExtractor {
  static IE_NAME = 'godresource';
  static _VALID_URL = /https?:\/\/new\.godresource\.com\/video\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const apiData = await this._download_json<Record<string, unknown>>(
      `https://api.godresource.com/api/Streams/${displayId}`,
      displayId,
    );

    const videoUrl = String(apiData.streamUrl ?? '');
    const isLive = !!apiData.isLive;
    const ext = determine_ext(videoUrl);
    let formats = apiData.formats as VideoInfo['formats'];
    let subtitles = apiData.subtitles as VideoInfo['subtitles'];

    if (ext === 'm3u8') {
      ({ formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, videoUrl, displayId, 'hls'));
    } else if (ext === 'mp4') {
      formats = [{ url: videoUrl, ext, format_id: ext }];
      subtitles = {};
    } else {
      throw new ExtractorError(`Unexpected video format ${ext}`);
    }

    return {
      id: displayId,
      formats,
      subtitles,
      title: '',
      is_live: isLive,
      ...traverse_obj(apiData, {
        title: ['title', str_or_none],
        thumbnail: ['thumbnail', url_or_none],
        view_count: ['views', (v) => (typeof v === 'number' ? v : undefined)],
        channel: ['channelName', str_or_none],
        channel_id: ['channelId', str_or_none],
        timestamp: ['streamDateCreated', unified_timestamp],
        modified_timestamp: ['streamDataModified', unified_timestamp],
      }),
    };
  }
}

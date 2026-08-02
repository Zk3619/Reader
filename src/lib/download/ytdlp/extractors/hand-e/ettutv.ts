/**
 * EttuTvIE — ported from yt-dlp ettutv.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { bool_or_none, traverse_obj, unified_timestamp, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class EttuTvIE extends InfoExtractor {
  static IE_NAME = 'ettutv';
  static _VALID_URL = /https?:\/\/(?:www\.)?ettu\.tv\/[^?#]+\/playerpage\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const playerSettings = await this._download_json<Record<string, unknown>>(
      `https://www.ettu.tv/api/v3/contents/${videoId}/player-settings`,
      videoId,
      undefined,
      {
        query: { language: 'en', showTitle: 'true', device: 'desktop' },
      },
    );

    const streamResponse = await this._download_json<{ data: { stream: string } }>(
      String(playerSettings.streamAccess),
      videoId,
      undefined,
      { data: '', method: 'POST' },
    );

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      streamResponse.data.stream,
      videoId,
    );

    return {
      id: videoId,
      formats,
      subtitles,
      title: (playerSettings.title as string) || undefined,
      description: traverse_obj(playerSettings, ['metaInformation', 'competition']) as string | undefined,
      thumbnail: url_or_none(traverse_obj(playerSettings, ['image'])) ?? undefined,
      timestamp: unified_timestamp(traverse_obj(playerSettings, ['date'])) ?? undefined,
      is_live: bool_or_none(traverse_obj(playerSettings, ['isLivestream'])) ?? undefined,
    };
  }
}

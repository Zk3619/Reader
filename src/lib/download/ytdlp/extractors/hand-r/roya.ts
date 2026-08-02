/** RoyaLiveIE — ported from yt-dlp roya.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class RoyaLiveIE extends InfoExtractor {
  static IE_NAME = 'RoyaLive';
  static _VALID_URL = /https?:\/\/(?:en\.)?roya\.tv\/live-stream\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mediaId = this._match_id(url);
    const ticket = await this._download_json<{ data?: { secured_url?: string } }>(
      `https://ticket.roya-tv.com/api/v5/fastchannel/${mediaId}`,
      mediaId,
    );
    const streamUrl = ticket.data?.secured_url;
    if (!streamUrl) throw new Error('No stream URL');

    const schedule = await this._download_json<Record<string, unknown>>(
      'https://backend.roya.tv/api/v01/channels/schedule-pagination',
      mediaId,
      undefined,
      { fatal: false },
    );
    const channels = (schedule.data as Array<Record<string, unknown>>) || [];
    const channel = channels.find((c) => String((c.channel as Record<string, unknown>)?.id) === mediaId)?.channel as Record<string, unknown> | undefined;
    const channelTitle = typeof channel?.title === 'string' ? channel.title : undefined;

    const formats = await this._extract_m3u8_formats(streamUrl, mediaId, 'mp4', 'm3u8_native', 'hls', undefined, undefined, undefined, true);

    return {
      id: mediaId,
      formats,
      title: channelTitle,
      is_live: true,
    };
  }
}

/** ShowRoomLive / ShowRoomVod — ported from yt-dlp showroomlive.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, extract_attributes, int_or_none, str_or_none, url_or_none } from '../../utils';
import { UserNotLive } from './_helpers';

export class ShowRoomLiveIE extends InfoExtractor {
  static IE_NAME = 'showroom:live';
  static IE_DESC = 'SHOWROOM';
  static _VALID_URL = /https?:\/\/(?:www\.)?showroom-live\.com\/r\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const broadcasterId = this._match_id(url);
    const webpage = await this._download_webpage(url, broadcasterId, undefined, {
      headers: { 'Accept-Language': 'ja' },
    });
    const nuxtData = this._search_json<{ data?: Record<string, unknown> }>(
      /window\.__NUXT__=/,
      webpage,
      'nuxt data',
      broadcasterId,
      { fatal: true },
    )!.data!;

    const cookies = this._get_cookies(url);
    const srId = cookies.sr_id;
    if (!srId) this.raise_login_required();

    const roomProfile = (nuxtData[`roomProfile-${broadcasterId}-${srId}`] as Record<string, unknown>) || {};
    const startTimestamp = int_or_none(roomProfile.current_live_started_at) ?? undefined;
    const isLive = roomProfile.is_onlive === true;

    if (!isLive) {
      if (startTimestamp) {
        throw new ExtractorError(
          `Next livestream is scheduled to start at ${new Date(startTimestamp * 1000).toLocaleString()}`,
          { expected: true },
        );
      }
      throw new UserNotLive(broadcasterId);
    }

    const roomId = str_or_none(roomProfile.room_id);
    const roomName =
      clean_html(String(roomProfile.room_name || roomProfile.main_name || '')) || undefined;
    const streaming = await this._download_json<{ streaming_url_list?: Array<Record<string, unknown>> }>(
      'https://www.showroom-live.com/api/live/streaming_url',
      broadcasterId,
      undefined,
      { query: { room_id: roomId! } },
    );
    const m3u8Url = streaming.streaming_url_list?.find((x) => x.type === 'hls_all')?.url as string | undefined;
    if (!m3u8Url) throw new ExtractorError('Unable to extract m3u8 URL');

    const formats = await this._extract_m3u8_formats(m3u8Url, broadcasterId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');

    return {
      title: roomName,
      channel: roomName,
      channel_id: broadcasterId,
      formats,
      is_live: isLive,
      release_timestamp: startTimestamp,
      id: str_or_none(roomProfile.live_id) || broadcasterId,
      channel_follower_count: int_or_none(roomProfile.follower_num) ?? undefined,
      description: clean_html(String(roomProfile.description || '')) || undefined,
      thumbnail: url_or_none(roomProfile.image_square) ?? undefined,
      view_count: int_or_none(roomProfile.view_num) ?? undefined,
    };
  }
}

export class ShowRoomVodIE extends InfoExtractor {
  static IE_NAME = 'showroom:vod';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?showroom-live\.com\/episode\/watch\?(?:[^#]+&)?id=(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const episodeId = this._match_id(url);
    const webpage = await this._download_webpage(url, episodeId);
    const dataEl = webpage.match(/<[^>]+id=["']episode-data["'][^>]*>/i)?.[0];
    const episodeData = dataEl
      ? (JSON.parse(extract_attributes(dataEl)['data-episode'] || '{}') as Record<string, unknown>)
      : {};

    const streaming = await this._download_json<{
      streaming_url_list?: { hls_all?: { hls_all?: string } };
      thumbnail_url?: string;
    }>('https://www.showroom-live.com/api/episode/streaming_url', episodeId, undefined, {
      query: { episode_id: episodeId },
    });
    const m3u8Url = streaming.streaming_url_list?.hls_all?.hls_all;
    if (!m3u8Url) throw new ExtractorError('Unable to extract m3u8 URL');

    const formats = await this._extract_m3u8_formats(m3u8Url, episodeId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');
    const series = episodeData.series as Record<string, unknown> | undefined;

    return {
      id: episodeId,
      formats,
      thumbnail: url_or_none(streaming.thumbnail_url) ?? undefined,
      title: clean_html(String(episodeData.title || '')) || episodeId,
      description: clean_html(String(episodeData.description || '')) || undefined,
      duration: int_or_none(episodeData.video_time) ?? undefined,
      timestamp: int_or_none(episodeData.display_started_at) ?? undefined,
      series: clean_html(String(series?.name || '')) || undefined,
      series_id: str_or_none(series?.id),
    };
  }
}

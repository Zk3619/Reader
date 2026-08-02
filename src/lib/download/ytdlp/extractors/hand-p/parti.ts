/** PartiBaseIE / PartiVideoIE / PartiLivestreamIE — ported from yt-dlp parti.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601, urljoin, UserNotLive } from './_helpers';

export class PartiBaseIE extends InfoExtractor {
  static IE_NAME = 'partibase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('PartiBaseIE is not a standalone extractor');
  }

  protected async _callApi(path: string, videoId: string, note?: string): Promise<Record<string, unknown>> {
    return this._download_json(`https://prod-api.parti.com/parti_v2/profile/${path}`, videoId, note, {
      headers: { Origin: 'https://parti.com', Referer: 'https://parti.com/' },
    });
  }
}

export class PartiVideoIE extends PartiBaseIE {
  static IE_NAME = 'parti:video';
  static _VALID_URL = /https?:\/\/(?:www\.)?parti\.com\/video\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._callApi(`get_livestream_channel_info/recent/${videoId}`, videoId);
    const streamUrl = urljoin('https://media.parti.com/', String(data.livestream_recording ?? ''));
    const formats: Format[] = await this._extract_m3u8_formats(streamUrl, videoId, 'mp4', 'm3u8_native');
    const categories = traverse_obj(data, ['category_name']) as string | undefined;
    return {
      id: videoId,
      formats,
      title: str_or_none(data.event_title) ?? undefined,
      channel: str_or_none(data.user_name) ?? undefined,
      thumbnail: url_or_none(data.event_file) ?? undefined,
      categories: categories ? [categories] : undefined,
      timestamp: int_or_none(data.event_start_ts) ?? undefined,
    };
  }
}

export class PartiLivestreamIE extends PartiBaseIE {
  static IE_NAME = 'parti:livestream';
  static _VALID_URL = /https?:\/\/(?:www\.)?parti\.com\/(?!video\/)(?<id>[\w/-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const creatorSlug = this._match_id(url);
    const encodedSlug = creatorSlug.replace('/', '%23');
    const creatorId = String(
      (await this._callApi(`user_id_from_name/${encodedSlug}`, creatorSlug, 'Fetching user ID')).user_id ?? '',
    );
    const data = await this._callApi(`get_livestream_channel_info/${creatorId}`, creatorId, 'Fetching user profile feed');
    const channelInfo = ((data.channel_info as Record<string, unknown>)?.channel as Record<string, unknown>) || {};
    if (!traverse_obj(data, ['channel_info', 'channel', 'is_live'])) {
      throw new UserNotLive(creatorId);
    }
    const formats: Format[] = await this._extract_m3u8_formats(String(channelInfo.playback_url ?? ''), creatorSlug, 'mp4', 'm3u8');
    const eventInfo = ((data.channel_info as Record<string, unknown>)?.livestream_event_info as Record<string, unknown>) || {};
    const stream = ((data.channel_info as Record<string, unknown>)?.stream as Record<string, unknown>) || {};
    return {
      id: creatorSlug,
      formats,
      is_live: true,
      title: str_or_none(eventInfo.event_name) ?? undefined,
      description: str_or_none(eventInfo.event_description) ?? undefined,
      thumbnail: url_or_none(eventInfo.livestream_preview_file) ?? undefined,
      timestamp: parseIso8601(stream.start_time) ?? undefined,
      view_count: int_or_none(stream.viewer_count) ?? undefined,
    };
  }
}

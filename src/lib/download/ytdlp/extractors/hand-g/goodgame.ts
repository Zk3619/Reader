/**
 * GoodGameIE — ported from yt-dlp goodgame.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extractM3u8FormatsAndSubtitles, protoRelative } from './_helpers';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';

export class GoodGameIE extends InfoExtractor {
  static IE_NAME = 'goodgame:stream';
  static _VALID_URL = /https?:\/\/goodgame\.ru\/(?!channel\/)(?<id>[\w.*-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelName = this._match_id(url);
    const response = await this._download_json<Record<string, unknown>>(
      `https://goodgame.ru/api/4/users/${channelName}/stream`,
      channelName,
    );
    const playerId = String(response.streamkey ?? '');

    let formats: VideoInfo['formats'] = [];
    let subtitles: VideoInfo['subtitles'] = {};
    if (response.status) {
      ({ formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, `https://hls.goodgame.ru/manifest/${playerId}_master.m3u8`, channelName, 'hls'));
    } else {
      this.raise_no_formats('User is offline', true);
    }

    return {
      id: playerId,
      formats,
      subtitles,
      is_live: !!formats?.length,
      title: str_or_none(traverse_obj(response, ['title'])) || undefined,
      channel: str_or_none(traverse_obj(response, ['channelkey'])) || undefined,
      channel_id: str_or_none(traverse_obj(response, ['id'])) || undefined,
      channel_url: url_or_none(traverse_obj(response, ['link'])) ?? undefined,
      uploader: str_or_none(traverse_obj(response, ['streamer', 'username'])) || undefined,
      uploader_id: str_or_none(traverse_obj(response, ['streamer', 'id'])) || undefined,
      thumbnail:
        protoRelative(url_or_none(traverse_obj(response, ['preview'])) || '') || undefined,
      concurrent_view_count: int_or_none(traverse_obj(response, ['viewers'])) ?? undefined,
      channel_follower_count: int_or_none(traverse_obj(response, ['followers'])) ?? undefined,
      age_limit: traverse_obj(response, ['adult']) ? 18 : undefined,
    };
  }
}

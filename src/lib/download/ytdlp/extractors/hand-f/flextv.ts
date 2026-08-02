/**
 * FlexTVIE ??ported from yt-dlp flextv.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, join_nonempty, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601, UserNotLive } from './_helpers';

export class FlexTVIE extends InfoExtractor {
  static IE_NAME = 'ttinglive';
  static IE_DESC = 'Ttinglive (formerly FlexTV)';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:ttinglive\.com|flextv\.co\.kr)\/channels\/(?<id>\d+)\/live/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    let streamData: Record<string, unknown>;
    try {
      streamData = await this._download_json<Record<string, unknown>>(
        `https://api.ttinglive.com/api/channels/${channelId}/stream`,
        channelId,
        undefined,
        { query: { option: 'all' } },
      );
    } catch (e) {
      const msg = (e as Error).message || '';
      if (/400/.test(msg)) throw new UserNotLive(channelId);
      throw e;
    }

    const formats: Format[] = [];
    const sources = traverse_obj(streamData, ['sources'], { get_all: true }) as Record<string, unknown>[];
    for (const stream of sources || []) {
      if (stream.format === 'ivs' && url_or_none(stream.url)) {
        formats.push(
          ...(await this._extract_m3u8_formats(
            String(stream.url),
            channelId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'ivs',
            undefined,
            false,
          )),
        );
      }
      const urlDetail = stream.urlDetail as Record<string, unknown> | undefined;
      for (const formatType of ['hls', 'flv'] as const) {
        const bucket = urlDetail?.[formatType] as Record<string, unknown> | undefined;
        const resolution = bucket?.resolution as Record<string, unknown> | undefined;
        if (!resolution || typeof resolution !== 'object') continue;
        for (const data of Object.values(resolution)) {
          if (!data || typeof data !== 'object') continue;
          const rec = data as Record<string, unknown>;
          const streamUrl = url_or_none(rec.url);
          if (!streamUrl) continue;
          formats.push({
            format_id: join_nonempty(formatType, str_or_none(rec.suffixName)),
            url: streamUrl,
            height: int_or_none(rec.resolution) ?? undefined,
            ext: formatType === 'hls' ? 'mp4' : 'flv',
            protocol: formatType === 'hls' ? 'm3u8_native' : 'http',
          });
        }
      }
    }

    const stream = (streamData.stream as Record<string, unknown>) || {};
    const owner = (streamData.owner as Record<string, unknown>) || {};
    return {
      id: channelId,
      formats,
      is_live: true,
      title: str_or_none(stream.title) ?? undefined,
      timestamp: parseIso8601(stream.createdAt) ?? undefined,
      thumbnail: url_or_none(streamData.thumbUrl) ?? undefined,
      channel: str_or_none(owner.name) ?? undefined,
      channel_id: str_or_none(owner.id) ?? undefined,
    };
  }
}

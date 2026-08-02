/**
 * BongaCamsIE — aligned with yt-dlp bongacams.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class BongaCamsIE extends InfoExtractor {
  static IE_NAME = 'bongacams';
  static _VALID_URL = /https?:\/\/(?<host>(?:[^/]+\.)?bongacams\d*\.(?:com|net))\/(?<id>[^/?&#]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const host = m.groups?.host ?? m[1] ?? '';
    const channelId = m.groups?.id ?? m[2] ?? '';

    const postData = new URLSearchParams();
    postData.append('method', 'getRoomData');
    postData.append('args[]', channelId);
    postData.append('args[]', 'false');

    const amf = await this._download_json<Record<string, unknown>>(
      `https://${host}/tools/amf.php`,
      channelId,
      undefined,
      { method: 'POST', data: postData.toString(), headers: { 'X-Requested-With': 'XMLHttpRequest' } },
    );

    const localData = (amf.localData as Record<string, unknown>) || {};
    const performerData = (amf.performerData as Record<string, unknown>) || {};
    const serverUrl = String(localData.videoServerUrl || '');

    const uploaderId = (performerData.username as string) || channelId;
    const uploader = (performerData.displayName as string) || undefined;
    const likeCount = int_or_none(performerData.loversCount);

    const formats = await this._extract_m3u8_formats(
      `${serverUrl}/hls/stream_${uploaderId}/playlist.m3u8`,
      channelId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );

    return {
      id: channelId,
      title: uploader || uploaderId,
      uploader,
      uploader_id: uploaderId,
      like_count: likeCount ?? undefined,
      age_limit: 18,
      is_live: true,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'bongacams',
      extractor_key: 'BongaCams',
    };
  }
}

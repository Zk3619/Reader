/**
 * CamModelsIE — ported from yt-dlp cammodels.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, url_or_none } from '../../utils';

export class CamModelsIE extends InfoExtractor {
  static IE_NAME = 'cammodels';
  static _VALID_URL = /https?:\/\/(?:www\.)?cammodels\.com\/cam\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const userId = this._match_id(url);

    const manifest = await this._download_json<{
      formats: Record<string, { encodings?: unknown[]; videoCodec?: string; audioCodec?: string }>;
    }>(`https://manifest-server.naiadsystems.com/live/s:${userId}.json`, userId);

    const formats: Format[] = [];
    const thumbnails: Thumbnail[] = [];

    for (const [formatId, formatDict] of Object.entries(manifest.formats || {})) {
      if (!formatDict || typeof formatDict !== 'object') continue;
      const encodings = formatDict.encodings;
      if (!Array.isArray(encodings)) continue;
      const vcodec = formatDict.videoCodec;
      const acodec = formatDict.audioCodec;
      for (const raw of encodings) {
        if (!raw || typeof raw !== 'object') continue;
        const media = raw as Record<string, unknown>;
        const mediaUrl = url_or_none(media.location);
        if (!mediaUrl) continue;

        const idParts = [formatId];
        const height = int_or_none(media.videoHeight);
        if (height != null) idParts.push(`${height}p`);

        const f: Format = {
          url: mediaUrl,
          format_id: idParts.join('-'),
          width: int_or_none(media.videoWidth),
          height,
          vbr: int_or_none(media.videoKbps),
          abr: int_or_none(media.audioKbps),
          fps: int_or_none(media.fps),
          vcodec,
          acodec,
        };

        if (formatId.includes('rtmp')) {
          f.ext = 'flv';
        } else if (formatId.includes('hls')) {
          f.ext = 'mp4';
          f.quality = -10;
        } else {
          if (formatId === 'jpeg') {
            thumbnails.push({ id: f.format_id, url: f.url!, width: f.width, height: f.height });
          }
          continue;
        }
        formats.push(f);
      }
    }

    return {
      id: userId,
      title: userId,
      thumbnails,
      is_live: true,
      formats,
      age_limit: 18,
    };
  }
}

// @ts-nocheck
/** VeoIE â€?ported from yt-dlp veo.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  mimetype2ext,
  str_or_none,
  unified_timestamp,
  url_or_none,
} from '../../utils';

export class VeoIE extends InfoExtractor {
  static IE_NAME = 'veo';
  static _VALID_URL = /https?:\/\/app\.veo\.co\/matches\/(?<id>[0-9A-Za-z-_]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const metadata = await this._download_json<Record<string, unknown>>(
      `https://app.veo.co/api/app/matches/${videoId}`,
      videoId,
    );
    const videoData = await this._download_json<Array<Record<string, unknown>>>(
      `https://app.veo.co/api/app/matches/${videoId}/videos`,
      videoId,
      'Downloading video data',
    );

    const formats: Format[] = [];
    for (const fmt of videoData || []) {
      const mimetype = str_or_none(fmt.mime_type);
      const formatUrl = url_or_none(fmt.url);
      if (!formatUrl || mimetype === 'video/mp2t') continue;

      const height = int_or_none(fmt.height);
      const renderType = str_or_none(fmt.render_type);
      const formatId =
        renderType && height != null ? `${renderType}-${height}p` : undefined;

      if (renderType === 'panorama') {
        const ok = await this._request_webpage(formatUrl, videoId, `Checking ${formatId}`, {
          fatal: false,
        });
        if (!ok) continue;
      }

      formats.push({
        url: formatUrl,
        format_id: formatId,
        ext: mimetype2ext(mimetype) || undefined,
        width: int_or_none(fmt.width) ?? undefined,
        height: height ?? undefined,
        vbr: int_or_none(fmt.bit_rate, 1000) ?? undefined,
      });
    }

    return {
      id: videoId,
      title: str_or_none(metadata.title) || videoId,
      formats,
      thumbnail: url_or_none(metadata.thumbnail) || undefined,
      timestamp: unified_timestamp(metadata.created) ?? undefined,
      view_count: int_or_none(metadata.view_count) ?? undefined,
      duration: int_or_none(metadata.duration) ?? undefined,
    };
  }
}

/**
 * TOnlineIE — ported from yt-dlp tonline.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, join_nonempty } from '../../utils';

export class TOnlineIE extends InfoExtractor {
  static IE_NAME = 't-online.de';
  static _VALID_URL = /https?:\/\/(?:www\.)?t-online\.de\/tv\/(?:[^/]+\/)*id_(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoData = await this._download_json<Record<string, unknown>>(
      `http://www.t-online.de/tv/id_${videoId}/tid_json_video`,
      videoId,
    );
    const title = String(videoData.subtitle || videoId);

    const formats: Format[] = [];
    for (const asset of (videoData.assets as Array<Record<string, unknown>>) || []) {
      const assetSource = (asset.source || asset.source2) as string | undefined;
      if (!assetSource) continue;
      formats.push({
        format_id: join_nonempty('type', asset.profile as string) || 'http',
        url: assetSource,
      });
    }

    const thumbnails: Thumbnail[] = [];
    for (const image of (videoData.images as Array<Record<string, unknown>>) || []) {
      const imageSource = image.source as string | undefined;
      if (!imageSource) continue;
      thumbnails.push({ url: imageSource });
    }

    return {
      id: videoId,
      title,
      description: (videoData.description as string) || undefined,
      duration: int_or_none(videoData.duration) ?? undefined,
      thumbnails,
      formats,
    };
  }
}

/**
 * AlibabaIE — aligned with yt-dlp alibaba.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';

export class AlibabaIE extends InfoExtractor {
  static IE_NAME = 'alibaba';
  static _VALID_URL = /https?:\/\/(?:www\.)?alibaba\.com\/product-detail\/[\w-]+_(?<id>\d+)\.html/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const detailData = this._search_json<{ globalData?: { product?: Record<string, unknown> } }>(
      /window\.detailData\s*=/,
      webpage,
      'detail data',
      displayId,
    );
    const productData = detailData?.globalData?.product || {};

    const mediaItems = (productData.mediaItems as Record<string, unknown>[]) || [];
    const videoItem = mediaItems.find(
      (v) => v.type === 'video' && v.videoId,
    ) as Record<string, unknown> | undefined;

    const formats: Format[] = [];
    if (videoItem) {
      const videoUrls = (videoItem.videoUrl as Record<string, unknown>[]) || [];
      for (const vu of videoUrls) {
        const mediaUrl = url_or_none(vu.videoUrl);
        if (!mediaUrl) continue;
        formats.push({
          url: mediaUrl,
          format_id: str_or_none(vu.definition) || '',
          tbr: int_or_none(vu.bitrate) ?? undefined,
          width: int_or_none(vu.width) ?? undefined,
          height: int_or_none(vu.height) ?? undefined,
          filesize: int_or_none(vu.length) ?? undefined,
        });
      }
    }

    return {
      id: videoItem ? String(videoItem.videoId) : displayId,
      display_id: displayId,
      title: traverse_obj(productData, ['subject', { expected_type: String }]) as string | undefined,
      duration: int_or_none(videoItem?.duration) ?? undefined,
      thumbnail: url_or_none(videoItem?.videoCoverUrl) || undefined,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'alibaba',
      extractor_key: 'Alibaba',
    };
  }
}

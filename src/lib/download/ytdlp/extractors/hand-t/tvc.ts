/**
 * TVCIE / TVCArticleIE — ported from yt-dlp tvc.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, int_or_none } from '../../utils';

export class TVCIE extends InfoExtractor {
  static IE_NAME = 'tvc';
  static _VALID_URL = /https?:\/\/(?:www\.)?tvc\.ru\/video\/iframe\/id\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const video = await this._download_json<Record<string, unknown>>(
      `http://www.tvc.ru/video/json/id/${videoId}`,
      videoId,
    );

    const formats: Format[] = [];
    const quality = (video.path as Record<string, unknown> | undefined)?.quality;
    if (Array.isArray(quality)) {
      for (const info of quality) {
        if (!info || typeof info !== 'object') continue;
        const rec = info as Record<string, unknown>;
        const videoUrl = rec.url != null ? String(rec.url) : '';
        if (!videoUrl) continue;
        const formatId =
          this._search_regex(/cdnvideo\/([^/]+?)(?:-[^/]+?)?\//, videoUrl, 'format id', null, false, 1) ||
          undefined;
        formats.push({
          url: videoUrl,
          format_id: formatId || 'http',
          width: int_or_none(rec.width) ?? undefined,
          height: int_or_none(rec.height) ?? undefined,
          tbr: int_or_none(rec.bitrate) ?? undefined,
        });
      }
    }

    return {
      id: videoId,
      title: String(video.title || `TVC video #${videoId}`),
      thumbnail: video.picture != null ? String(video.picture) : undefined,
      duration: int_or_none(video.duration) ?? undefined,
      formats,
    };
  }
}

export class TVCArticleIE extends InfoExtractor {
  static IE_NAME = 'tvc:article';
  static _VALID_URL = /https?:\/\/(?:www\.)?tvc\.ru\/(?!video\/iframe\/id\/)(?<id>[^?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const ogVideo = this._og_search_video_url(webpage);
    if (!ogVideo) throw new ExtractorError('No TVC video URL found', { expected: true });

    return {
      _type: 'url_transparent',
      ie_key: 'TVC',
      id: displayId,
      url: ogVideo,
      title: clean_html(this._og_search_title(webpage) || '') || undefined,
      description: clean_html(this._og_search_description(webpage) || '') || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
    };
  }
}

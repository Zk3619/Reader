/**
 * AparatIE — aligned with yt-dlp aparat.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  get_element_by_id,
  int_or_none,
  merge_dicts,
  mimetype2ext,
  url_or_none,
} from '../../utils';

export class AparatIE extends InfoExtractor {
  static IE_NAME = 'aparat';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?aparat\.com\/(?:v\/|video\/video\/embed\/videohash\/)(?<id>[a-zA-Z0-9]+)/i;

  parseOptions(webpage: string, videoId: string, fatal = true): Record<string, unknown> {
    const raw = this._search_regex(/options\s*=\s*({.+?})\s*;/, webpage, 'options', '{}', !fatal);
    return (this._parse_json(raw, videoId, null, fatal) as Record<string, unknown>) || {};
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    let webpage = await this._download_webpage(url, videoId, undefined, { fatal: false });
    let options = this.parseOptions(webpage, videoId, false);

    if (!Object.keys(options).length) {
      webpage = await this._download_webpage(
        `http://www.aparat.com/video/video/embed/vt/frame/showvideo/yes/videohash/${videoId}`,
        videoId,
        'Downloading embed webpage',
      );
      options = this.parseOptions(webpage, videoId);
    }

    const formats: Format[] = [];
    for (const sources of (options.multiSRC as Record<string, unknown>[][]) || []) {
      for (const item of sources) {
        if (!item || typeof item !== 'object') continue;
        const fileUrl = url_or_none(item.src);
        if (!fileUrl) continue;
        const itemType = item.type != null ? String(item.type) : '';
        if (itemType === 'application/vnd.apple.mpegurl') {
          formats.push(
            ...(await this._extract_m3u8_formats(fileUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
          );
        } else {
          const ext = mimetype2ext(itemType) || 'mp4';
          const label = item.label != null ? String(item.label) : '';
          formats.push({
            url: fileUrl,
            ext,
            format_id: `http-${label || ext}`,
            height: int_or_none(label.match(/(\d+)[pP]/)?.[1]) ?? undefined,
          });
        }
      }
    }

    const info = this._search_json_ld(webpage, videoId, { fatal: false });
    if (!info.title) {
      info.title =
        get_element_by_id('videoTitle', webpage) ||
        this._html_search_meta(['og:title', 'twitter:title', 'DC.Title', 'title'], webpage, undefined, true);
    }

    return merge_dicts(info, {
      id: videoId,
      thumbnail: url_or_none(options.poster) || undefined,
      duration: int_or_none(options.duration),
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'aparat',
      extractor_key: 'Aparat',
    }) as VideoInfo;
  }
}

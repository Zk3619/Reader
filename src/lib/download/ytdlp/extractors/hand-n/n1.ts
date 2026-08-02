/**
 * N1InfoAssetIE / N1InfoIIE — ported from yt-dlp n1.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  extract_attributes,
  unified_timestamp,
  url_or_none,
} from '../../utils';

export class N1InfoAssetIE extends InfoExtractor {
  static IE_NAME = 'n1infoasset';
  static _VALID_URL =
    /https?:\/\/best-vod\.umn\.cdn\.united\.cloud\/stream\?asset=(?<id>[^&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const formats = await this._extract_m3u8_formats(url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false);
    return { id: videoId, title: videoId, formats };
  }
}

export class N1InfoIIE extends InfoExtractor {
  static IE_NAME = 'N1Info:article';
  static _VALID_URL =
    /https?:\/\/(?:(?:\w+\.)?n1info\.\w+|nova\.rs)\/(?:[^/?#]+\/){1,2}(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const webpage = await this._download_webpage(url, articleId);

    const title = this._og_search_title(webpage) || undefined;
    const timestamp =
      unified_timestamp(
        this._og_search_property('published_time', webpage, undefined, false) ||
          this._html_search_meta('article:published_time', webpage, undefined, false),
      ) ?? undefined;

    const pluginData = [...webpage.matchAll(/\$bp\("(?:Brid|TargetVideo)_\d+",\s(.+)\);/g)].map((m) => m[1]!);
    const entries: VideoInfo[] = [];

    if (pluginData.length) {
      let siteId =
        this._html_search_regex(/site:(\d+)/, webpage, 'site id', undefined, false) ||
        this._search_regex(/partners\/(\d+)/, this._html_search_meta('contentUrl', webpage)!, 'site ID');
      for (const videoDataRaw of pluginData) {
        const videoData = this._parse_json<{ video?: string }>(videoDataRaw, title || articleId)!;
        const videoId = String(videoData.video ?? '');
        const m3u8Url = `https://cdn-uc.brid.tv/live/partners/${siteId}/streaming/${videoId}/${videoId}.m3u8`;
        const formats = await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false);
        entries.push({
          id: videoId,
          title,
          timestamp,
          thumbnail: this._html_search_meta('thumbnailURL', webpage, undefined, false) || undefined,
          formats,
        });
      }
    } else {
      for (const video of webpage.match(/<video[^>]+>/gim) || []) {
        const videoData = extract_attributes(video);
        entries.push({
          _type: 'url_transparent',
          url: videoData['data-url'] || '',
          id: videoData.id || articleId,
          title,
          thumbnail:
            url_or_none(videoData['data-thumbnail']) ||
            url_or_none(videoData['data-default_thumbnail']) ||
            undefined,
          timestamp,
          ie_key: 'N1InfoAsset',
        });
      }
    }

    for (const embedded of webpage.match(/<iframe[^>]+>/gim) || []) {
      const videoData = extract_attributes(embedded);
      const embedUrl = videoData.src || '';
      let hostname: string | undefined;
      try {
        hostname = new URL(embedUrl).hostname;
      } catch {
        /* ignore */
      }
      if (hostname === 'www.youtube.com') {
        entries.push(this.url_result(embedUrl, 'Youtube') as VideoInfo);
      } else if (hostname === 'www.redditmedia.com') {
        entries.push(this.url_result(embedUrl, 'Reddit') as VideoInfo);
      } else if (hostname === 'www.facebook.com' && embedUrl.includes('plugins/video')) {
        entries.push(this.url_result(embedUrl, 'FacebookPluginsVideo') as VideoInfo);
      }
    }

    return { _type: 'playlist', id: articleId, title, timestamp, entries };
  }
}

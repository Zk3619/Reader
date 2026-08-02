/** RENTV* — ported from yt-dlp rentv.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, url_or_none } from '../../utils';

export class RENTVIE extends InfoExtractor {
  static IE_NAME = 'RENTV';
  static _VALID_URL = /(?:rentv:|https?:\/\/(?:www\.)?ren\.tv\/(?:player|video\/epizod)\/)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`http://ren.tv/player/${videoId}`, videoId);
    const configRaw = this._search_regex(/config\s*=\s*(\{[\s\S]+?\})\s*;/, webpage, 'config');
    const config = this._parse_json(configRaw!, videoId) as Record<string, unknown>;
    const formats: Format[] = [];
    for (const video of (config.src as Array<Record<string, unknown>>) || []) {
      const src = url_or_none(video.src);
      if (!src) continue;
      const ext = determine_ext(src);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(src, videoId, 'mp4', 'm3u8_native', 'hls', undefined, undefined, undefined, false)),
        );
      } else {
        formats.push({ url: src, format_id: ext || 'http' });
      }
    }
    return {
      id: videoId,
      title: config.title as string,
      description: config.description as string | undefined,
      thumbnail: config.image as string | undefined,
      duration: int_or_none(config.duration) ?? undefined,
      timestamp: int_or_none(config.date) ?? undefined,
      formats,
    };
  }
}

export class RENTVArticleIE extends InfoExtractor {
  static IE_NAME = 'RENTVArticle';
  static _VALID_URL = /https?:\/\/(?:www\.)?ren\.tv\/novosti\/\d{4}-\d{2}-\d{2}\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const settingsRaw = this._search_regex(
      /jQuery\.extend\(Drupal\.settings\s*,\s*(\{[\s\S]+?\})\);/,
      webpage,
      'drupal settings',
    );
    const drupalSettings = this._parse_json(settingsRaw!, displayId) as Record<string, unknown>;
    const entries: VideoInfo[] = [];
    for (const configProfile of Object.values((drupalSettings.ren_jwplayer as Record<string, unknown>) || {})) {
      const profile = configProfile as Record<string, unknown>;
      const mediaId = profile.mediaid;
      if (!mediaId) continue;
      entries.push(this.url_result(`rentv:${String(mediaId)}`, 'RENTV', String(mediaId)));
    }
    return this.playlist_result(entries, displayId);
  }
}

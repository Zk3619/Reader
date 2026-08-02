/**
 * AllocineIE — aligned with yt-dlp allocine.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, remove_end, unified_timestamp, url_or_none } from '../../utils';
import { htmlExtractTitle, qualityRank, stripOrNone, urlBasename } from './_helpers';

const QUALITY = qualityRank(['ld', 'md', 'hd']);

export class AllocineIE extends InfoExtractor {
  static IE_NAME = 'allocine';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?allocine\.fr\/(?:article|video|film)\/(?:fichearticle_gen_carticle=|player_gen_cmedia=|fichefilm_gen_cfilm=|video-)(?<id>[0-9]+)(?:\.html)?/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const formats: Format[] = [];
    let videoId = displayId;
    let title: string | undefined;
    let duration: number | undefined;
    let viewCount: number | undefined;
    let timestamp: number | undefined;

    const model = this._html_search_regex(/data-model="([^"]+)"/, webpage, 'data model', null, false);
    if (model) {
      const modelData = this._parse_json<{ videos?: Record<string, unknown>[] }>(model, displayId)!;
      const video = modelData.videos?.[0] as Record<string, unknown> | undefined;
      if (video) {
        title = String(video.title || displayId);
        const sources = (video.sources || {}) as Record<string, string>;
        for (const videoUrl of Object.values(sources)) {
          const base = urlBasename(videoUrl);
          const [vid, formatId] = base.split('_');
          videoId = vid || videoId;
          formats.push({
            format_id: formatId,
            quality: QUALITY(formatId || ''),
            url: videoUrl,
          });
        }
        duration = int_or_none(video.duration) ?? undefined;
        viewCount = int_or_none(video.view_count) ?? undefined;
        const addedAt = (video.added_at as Record<string, unknown> | undefined)?.date;
        timestamp = unified_timestamp(addedAt) ?? undefined;
      }
    } else {
      videoId = displayId;
      const mediaData = await this._download_json<{ video?: Record<string, string> }>(
        `http://www.allocine.fr/ws/AcVisiondataV5.ashx?media=${videoId}`,
        displayId,
      );
      title = remove_end(stripOrNone(htmlExtractTitle(webpage)), ' - AlloCiné') || undefined;
      const videoObj = mediaData.video || {};
      for (const [key, value] of Object.entries(videoObj)) {
        if (!key.endsWith('Path')) continue;
        const formatId = key.slice(0, -'Path'.length);
        formats.push({
          format_id: formatId,
          quality: QUALITY(formatId),
          url: value,
        });
      }
    }

    return {
      id: videoId,
      display_id: displayId,
      title: title || displayId,
      description: this._og_search_description(webpage) || undefined,
      thumbnail: url_or_none(this._og_search_thumbnail(webpage)) || undefined,
      duration,
      timestamp,
      view_count: viewCount,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'allocine',
      extractor_key: 'Allocine',
    };
  }
}

/** RoosterTeeth* — ported from yt-dlp roosterteeth.py (main paths) */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { int_or_none, smuggle_url, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class RoosterTeethBaseIE extends InfoExtractor {
  static IE_NAME = 'RoosterTeethBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _NETRC_MACHINE = 'roosterteeth';
  static _API_BASE = 'https://svod-be.roosterteeth.com';
  static _API_BASE_URL = `${RoosterTeethBaseIE._API_BASE}/api/v1`;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('RoosterTeethBaseIE is not a standalone extractor');
  }

  protected _extractVideoInfo(data: Record<string, unknown>): VideoInfo {
    const thumbnails: Thumbnail[] = [];
    for (const image of (traverse_obj(data, ['included', 'images']) as Array<Record<string, unknown>>) || []) {
      if (!['episode_image', 'bonus_feature_image'].includes(String(image.type || ''))) continue;
      for (const [name, imgUrl] of Object.entries((image.attributes as Record<string, string>) || {})) {
        if (url_or_none(imgUrl)) thumbnails.push({ id: name, url: imgUrl });
      }
    }
    const attributes = (data.attributes as Record<string, unknown>) || {};
    const title = (attributes.title || attributes.display_title) as string | undefined;
    let videoId = str_or_none(data.id);
    const episodeId = str_or_none(data.uuid);
    if (videoId && 'parent_content_id' in attributes) videoId += '-bonus';
    else if (!videoId) videoId = episodeId;
    return {
      id: videoId!,
      display_id: attributes.slug as string | undefined,
      title,
      description: (attributes.description || attributes.caption) as string | undefined,
      series: (attributes.show_title || attributes.parent_content_title) as string | undefined,
      season_number: int_or_none(attributes.season_number as number) ?? undefined,
      season_id: str_or_none(attributes.season_id as string) ?? undefined,
      episode: title,
      episode_number: int_or_none(attributes.number as number) ?? undefined,
      episode_id: episodeId ?? undefined,
      channel_id: attributes.channel_id as string | undefined,
      duration: int_or_none(attributes.length as number) ?? undefined,
      release_timestamp: parseIso8601(attributes.original_air_date as string) ?? undefined,
      thumbnails,
      tags: attributes.genres as string[] | undefined,
    };
  }
}

export class RoosterTeethIE extends RoosterTeethBaseIE {
  static IE_NAME = 'RoosterTeeth';
  static _VALID_URL = /https?:\/\/(?:.+?\.)?roosterteeth\.com\/(?:bonus-feature|episode|watch)\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const data = await this._download_json<{ data?: Record<string, unknown> }>(
      `${RoosterTeethBaseIE._API_BASE_URL}/videos/${displayId}`,
      displayId,
    );
    const videoData = data.data || {};
    const info = this._extractVideoInfo(videoData);
    const attrs = (videoData.attributes as Record<string, unknown>) || {};
    const m3u8Url = attrs.url as string | undefined;
    if (m3u8Url) return { ...info, formats: await this._extract_m3u8_formats(m3u8Url, info.id!) };
    const bcId = attrs.brightcove_id as string | undefined;
    if (bcId) {
      return this.url_result(
        smuggle_url(`https://players.brightcove.net/2231763107001/default_default/index.html?videoId=${bcId}`, { referer: url }),
        'BrightcoveNew',
        bcId,
      );
    }
    return info;
  }
}

export class RoosterTeethSeriesIE extends RoosterTeethBaseIE {
  static IE_NAME = 'RoosterTeethSeries';
  static _VALID_URL = /https?:\/\/(?:.+?\.)?roosterteeth\.com\/(?:show|series)\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const seriesId = this._match_id(url);
    const data = await this._download_json<{ data?: Array<{ attributes?: { slug?: string } }> }>(
      `${RoosterTeethBaseIE._API_BASE_URL}/shows/${seriesId}/bonus-features`,
      seriesId,
      undefined,
      { fatal: false },
    );
    const entries = (data.data || []).map((ep) =>
      this.url_result(`https://roosterteeth.com/watch/${ep.attributes?.slug}`, 'RoosterTeeth'),
    );
    return this.playlist_result(entries, seriesId);
  }
}

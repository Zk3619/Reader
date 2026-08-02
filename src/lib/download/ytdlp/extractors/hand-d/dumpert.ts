/**
 * DumpertIE — ported from yt-dlp dumpert.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { determine_ext, int_or_none } from '../../utils';
import { qualityRank } from './_helpers';

export class DumpertIE extends InfoExtractor {
  static IE_NAME = 'dumpert';
  static _VALID_URL =
    /(?<protocol>https?):\/\/(?:(?:www|legacy)\.)?dumpert\.nl\/(?:mediabase|embed|item\/|[\s\S]*[?&]selectedId=)(?<id>[0-9]+[/_][0-9a-zA-Z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url).replace('_', '/');
    const item = (
      await this._download_json<{ items: Record<string, unknown>[] }>(
        `http://api-live.dumpert.nl/mobile_api/json/info/${videoId.replace('/', '_')}`,
        videoId,
      )
    ).items[0]!;
    const title = String(item.title ?? videoId);
    const mediaList = Array.isArray(item.media) ? item.media : [];
    const media = mediaList.find((m) => m && typeof m === 'object' && (m as Record<string, unknown>).mediatype === 'VIDEO') as
      | Record<string, unknown>
      | undefined;
    if (!media) throw new Error('No video media found');

    const quality = qualityRank(['flv', 'mobile', 'tablet', '720p', '1080p']);
    const formats: Format[] = [];
    const variants = Array.isArray(media.variants) ? media.variants : [];
    for (const variant of variants) {
      if (!variant || typeof variant !== 'object') continue;
      const v = variant as Record<string, unknown>;
      const uri = v.uri as string | undefined;
      if (!uri) continue;
      const version = String(v.version ?? 'unknown');
      const preference = quality(version);
      if (determine_ext(uri) === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(uri, videoId, 'mp4', 'm3u8', undefined, preference, version, undefined, false)),
        );
      } else {
        formats.push({ url: uri, format_id: version, quality: preference });
      }
    }

    const thumbnails: Thumbnail[] = [];
    const stills = (item.stills as Record<string, string>) || {};
    for (const t of ['thumb', 'still'] as const) {
      for (const s of ['', '-medium', '-large'] as const) {
        const stillId = t + s;
        const stillUrl = stills[stillId];
        if (stillUrl) thumbnails.push({ id: stillId, url: stillUrl });
      }
    }

    const stats = (item.stats as Record<string, unknown>) || {};
    return {
      id: videoId,
      title,
      description: (item.description as string) ?? undefined,
      thumbnails,
      formats,
      duration: int_or_none(media.duration) ?? undefined,
      like_count: int_or_none(stats.kudos_total) ?? undefined,
      view_count: int_or_none(stats.views_total) ?? undefined,
    };
  }
}

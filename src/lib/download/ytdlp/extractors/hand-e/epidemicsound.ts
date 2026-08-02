/**
 * EpidemicSoundIE — ported from yt-dlp epidemicsound.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  join_nonempty,
  parse_qs,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { orderedSet, parseIso8601 } from './_helpers';

function epidemicParseThumbnail(thumbUrl: string): Thumbnail | null {
  if (!url_or_none(thumbUrl)) return null;
  const qs = parse_qs(thumbUrl);
  const width = int_or_none(qs.width?.[0]);
  const height = int_or_none(qs.height?.[0]);
  return {
    url: thumbUrl,
    ...(width != null ? { width } : {}),
    ...(height != null ? { height } : {}),
  };
}

function epidemicFmtOrNone(f: Partial<Format> & { url?: string; format?: string; format_id?: string }): Format | null {
  if (!f.format) f.format = f.format_id;
  else if (!f.format_id) f.format_id = f.format;
  if (!f.url || !f.format) return null;
  if (f.format_note) f.format_note = `track ID ${f.format_note}`;
  if (f.format !== 'full') f.preference = -2;
  return f as Format;
}

export class EpidemicSoundIE extends InfoExtractor {
  static IE_NAME = 'epidemicsound';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?epidemicsound\.com\/(?:(?<sfx>sound-effects\/tracks)|track)\/(?<id>[0-9a-zA-Z-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const isSfx = !!m.groups!.sfx;
    const jsonData = (await this._download_json(
      join_nonempty('https://www.epidemicsound.com/json/track', isSfx ? 'kosmos-id' : null, videoId, '/'),
      videoId,
    )) as Record<string, unknown>;

    const thumbnails: string[] = [];
    const imageUrl = traverse_obj(jsonData, ['imageUrl', 'cover']);
    if (typeof imageUrl === 'string') thumbnails.push(imageUrl);
    const thumbBaseUrl = url_or_none(traverse_obj(jsonData, ['coverArt', 'baseUrl']));
    const sizes = traverse_obj(jsonData, ['coverArt', 'sizes'], { get_all: true }) as string[] | undefined;
    if (thumbBaseUrl && sizes) {
      for (const size of sizes) thumbnails.push(`${thumbBaseUrl}${size}`);
    }

    const stems = (jsonData.stems as Record<string, Record<string, unknown>>) || {};
    const formats: Format[] = [];
    for (const [formatName, stem] of Object.entries(stems)) {
      const fmt = epidemicFmtOrNone({
        format: formatName,
        format_note: str_or_none(stem.s3TrackId) ?? undefined,
        format_id: str_or_none(stem.stemType) ?? undefined,
        url: url_or_none(stem.lqMp3Url) ?? undefined,
      });
      if (fmt) formats.push(fmt);
    }

    const genres = traverse_obj(jsonData, ['genres'], { get_all: true }) as Array<{ tag?: string }> | undefined;
    const categories = genres?.map((g) => g.tag).filter(Boolean) as string[] | undefined;
    const tags = traverse_obj(jsonData, ['metadataTags'], { get_all: true }) as string[] | undefined;
    const isExplicit = traverse_obj(jsonData, ['isExplicit']);

    return {
      id: str_or_none(traverse_obj(jsonData, ['id'])) ?? videoId,
      display_id: str_or_none(traverse_obj(jsonData, ['publicSlug'])) ?? undefined,
      title: str_or_none(traverse_obj(jsonData, ['title'])) ?? videoId,
      alt_title: str_or_none(traverse_obj(jsonData, ['oldTitle'])) ?? undefined,
      duration: float_or_none(traverse_obj(jsonData, ['length'])) ?? undefined,
      timestamp: parseIso8601(traverse_obj(jsonData, ['added'])) ?? undefined,
      release_timestamp: parseIso8601(traverse_obj(jsonData, ['releaseDate'])) ?? undefined,
      categories,
      tags,
      age_limit: isExplicit ? 18 : undefined,
      thumbnails: orderedSet(thumbnails)
        .map((u) => epidemicParseThumbnail(u))
        .filter(Boolean) as Thumbnail[],
      formats,
    };
  }
}

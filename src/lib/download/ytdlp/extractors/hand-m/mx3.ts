/**
 * Mx3BaseIE / Mx3IE / Mx3NeoIE / Mx3VolksmusikIE — ported from yt-dlp mx3.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { get_element_by_class, int_or_none, str_or_none, url_or_none } from '../../utils';

const FORMATS = [
  { url: 'player_asset', format_id: 'default', quality: 0 },
  { url: 'player_asset?quality=hd', format_id: 'hd', quality: 1 },
  { url: 'download', format_id: 'download', quality: 2 },
  { url: 'player_asset?quality=source', format_id: 'source', quality: 2 },
];

export class Mx3BaseIE extends InfoExtractor {
  static IE_NAME = 'mx3base';
  static _VALID_URL: RegExp | string | false | null = false;
  protected static _DOMAIN = 'mx3.ch';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('Mx3BaseIE is not a standalone extractor');
  }

  protected async _extractFormats(trackId: string): Promise<Format[]> {
    const formats: Format[] = [];
    for (const fmt of FORMATS) {
      const formatUrl = `https://${(this.constructor as typeof Mx3BaseIE)._DOMAIN}/tracks/${trackId}/${fmt.url}`;
      try {
        await this._download_webpage(formatUrl, trackId, `Checking for format ${fmt.format_id}`, { fatal: false });
        formats.push({
          ...fmt,
          url: formatUrl,
          ext: formatUrl.split('.').pop()?.split('?')[0] || undefined,
        });
      } catch {
        /* 404 — format unavailable */
      }
    }
    return formats;
  }

  protected async _extractTrack(url: string): Promise<VideoInfo> {
    const trackId = this._match_id(url);
    const domain = (this.constructor as typeof Mx3BaseIE)._DOMAIN;
    const webpage = await this._download_webpage(url, trackId);
    const moreInfo = get_element_by_class('single-more-info', webpage) || '';
    const data = await this._download_json<Record<string, unknown>>(
      `https://${domain}/t/${trackId}.json`,
      trackId,
      undefined,
      { fatal: false },
    );

    const getInfoField = (name: string): string | null => {
      const m = moreInfo.match(
        new RegExp(`<dt[^>]*>\\s*${name}\\s*</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`, 'i'),
      );
      return m?.[1]?.trim() || null;
    };

    const genreMatch = webpage.match(/<div\b[^>]+class="single-band-genre"[^>]*>([^<]+)<\/div>/i);
    const tagField = getInfoField('Tag');

    return {
      id: trackId,
      formats: await this._extractFormats(trackId),
      genre: genreMatch?.[1]?.trim() || undefined,
      release_year: int_or_none(getInfoField('Year of creation') || '') ?? undefined,
      description: getInfoField('Description') || undefined,
      tags: tagField ? tagField.split(',').map((t) => t.trim()).filter(Boolean) : [],
      title: str_or_none(data?.title) ?? undefined,
      artist: str_or_none(data?.performer_name || data?.artist) ?? undefined,
      album_artist: str_or_none(data?.artist) ?? undefined,
      composer: str_or_none(data?.composer_name) ?? undefined,
      thumbnail: url_or_none(data?.picture_url_xlarge || data?.picture_url) ?? undefined,
    };
  }
}

export class Mx3IE extends Mx3BaseIE {
  static IE_NAME = 'mx3';
  static _DOMAIN = 'mx3.ch';
  static _VALID_URL = /https?:\/\/mx3\.ch\/t\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractTrack(url);
  }
}

export class Mx3NeoIE extends Mx3BaseIE {
  static IE_NAME = 'mx3:neo';
  static _DOMAIN = 'neo.mx3.ch';
  static _VALID_URL = /https?:\/\/neo\.mx3\.ch\/t\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractTrack(url);
  }
}

export class Mx3VolksmusikIE extends Mx3BaseIE {
  static IE_NAME = 'mx3:volksmusik';
  static _DOMAIN = 'volksmusik.mx3.ch';
  static _VALID_URL = /https?:\/\/volksmusik\.mx3\.ch\/t\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractTrack(url);
  }
}

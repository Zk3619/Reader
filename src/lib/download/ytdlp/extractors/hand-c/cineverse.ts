/**
 * Cineverse family — ported from yt-dlp cineverse.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  smuggle_url,
  str_or_none,
  traverse_obj,
  unsmuggle_url,
  url_or_none,
} from '../../utils';
import { searchNextjsData } from './_helpers';

const CINEVERSE_HOSTS = [
  'cineverse.com',
  'asiancrush.com',
  'dovechannel.com',
  'screambox.com',
  'midnightpulp.com',
  'fandor.com',
  'retrocrush.tv',
];

const VALID_URL_BASE = `https?:\\/\\/www\\.(?<host>${CINEVERSE_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|')})`;

function parseAgeLimit(rating: unknown): number | null {
  if (rating == null) return null;
  const s = String(rating).trim().toUpperCase();
  const n = Number(s);
  if (Number.isFinite(n) && s !== '') return n;
  const map: Record<string, number> = { G: 0, PG: 10, PG13: 13, R: 17, NC17: 18, NR: 0 };
  return map[s] ?? null;
}

export class CineverseBaseIE extends InfoExtractor {
  static IE_NAME = 'cineversebase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('CineverseBaseIE is not a standalone extractor', { expected: true });
  }
}

export class CineverseIE extends CineverseBaseIE {
  static IE_NAME = 'Cineverse';
  static _VALID_URL = new RegExp(`${VALID_URL_BASE}\\/watch\\/(?<id>[A-Z0-9]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, smuggledData] = unsmuggle_url(url, {});
    const videoId = this._match_id(cleanUrl);
    const html = await this._download_webpage(cleanUrl, videoId);
    const idetails = traverse_obj(searchNextjsData(this, html, videoId), [
      'pageProps',
      'idetails',
    ]) as Record<string, unknown>;

    const errCode = idetails.err_code;
    if (errCode === 1002) this.raise_login_required();
    if (errCode === 1200) {
      this.raise_geo_restricted(
        'This video is not available from your location due to geo restriction. ' +
          'You may be able to bypass it by using the /details/ page instead of the /watch/ page',
        smuggledData.geo_countries,
      );
    }

    const subUrl =
      url_or_none(idetails.cc_url_vtt) || url_or_none(idetails.subtitle_url) || undefined;
    const subtitles: Record<string, Subtitle[]> | undefined = subUrl
      ? { en: [{ url: subUrl, ext: 'vtt' }] }
      : undefined;

    const details = (idetails.details as Record<string, unknown>) || {};
    const castRaw = str_or_none(details.cast);
    const updatedBy = Array.isArray(details.updated_by) ? details.updated_by[0] : undefined;
    const updateTime = (updatedBy as Record<string, unknown> | undefined)?.update_time as
      | Record<string, unknown>
      | undefined;

    return {
      subtitles,
      formats: await this._extract_m3u8_formats(String(idetails.url), videoId),
      title: str_or_none(idetails.title) ?? undefined,
      id: str_or_none(details.item_id) || videoId,
      description: str_or_none(details.description) ?? undefined,
      duration: float_or_none(idetails.duration, 1000) ?? undefined,
      cast: castRaw ? castRaw.split(', ') : undefined,
      modified_timestamp: int_or_none(updateTime?.time) ?? undefined,
      season_number: int_or_none(details.season) ?? undefined,
      episode_number: int_or_none(details.episode) ?? undefined,
      age_limit: parseAgeLimit(details.rating_code) ?? undefined,
      series: str_or_none(traverse_obj(details, ['series_details', 'title'])) ?? undefined,
    };
  }
}

export class CineverseDetailsIE extends CineverseBaseIE {
  static IE_NAME = 'CineverseDetails';
  static _VALID_URL = new RegExp(`${VALID_URL_BASE}\\/details\\/(?<id>[A-Z0-9]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const host = m.groups!.host!;
    const seriesId = m.groups!.id!;
    const html = await this._download_webpage(url, seriesId);
    const pageprops = searchNextjsData(this, html, seriesId).pageProps as Record<string, unknown>;

    const itemDetailsData = (pageprops.itemDetailsData as Record<string, unknown>) || {};
    const geoCountry = str_or_none(itemDetailsData.geo_country);
    const geoCountries = geoCountry ? geoCountry.split(', ') : undefined;
    const geoblocked =
      str_or_none(itemDetailsData.playback_err_msg) ===
      'This title is not available in your location.';

    const itemResult = (item: Record<string, unknown>): VideoInfo => {
      let itemUrl = `https://www.${host}/watch/${item.item_id}/${item.title}`;
      if (geoblocked) itemUrl = smuggle_url(itemUrl, { geo_countries: geoCountries });
      return this.url_result(itemUrl, 'Cineverse');
    };

    const seasonEpisodes = pageprops.seasonEpisodes as Array<Record<string, unknown>> | undefined;
    const episodes: Array<Record<string, unknown>> = [];
    for (const season of seasonEpisodes || []) {
      const eps = season.episodes as Array<Record<string, unknown>> | undefined;
      for (const ep of eps || []) {
        if (ep.item_id && ep.title) episodes.push(ep);
      }
    }

    if (episodes.length) {
      return this.playlist_result(
        episodes.map(itemResult),
        seriesId,
        str_or_none(itemDetailsData.title) ?? undefined,
      );
    }
    return itemResult(itemDetailsData);
  }
}

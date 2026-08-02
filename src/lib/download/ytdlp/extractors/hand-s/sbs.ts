/** SBSIE — ported from yt-dlp sbs.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  parse_duration,
  traverse_obj,
  update_url_query,
} from '../../utils';
import { extractSmilMediaUrls, extractM3u8FormatsAndSubtitles, parseIso8601 } from './_helpers';

const AUS_TV: Record<string, number> = {
  P: 0,
  C: 7,
  G: 0,
  PG: 0,
  M: 14,
  'MA15+': 15,
  'MAV15+': 15,
  'R18+': 18,
};

export class SBSIE extends InfoExtractor {
  static IE_NAME = 'sbs';
  static IE_DESC = 'sbs.com.au';
  static _GEO_COUNTRIES = ['AU'];
  static _VALID_URL =
    /https?:\/\/(?:www\.)?sbs\.com\.au\/(?:ondemand(?:\/video(?:\/single)?|\/(?:movie|tv-program)\/[^/]+\/|\/(?:tv|news)-series\/(?:[^/]+\/){3}|.*?\bplay=|\/watch\/)|news(?:\/embeds)?\/video\/)(?<id>[0-9]+)/;
  static _PLAYER_API = 'https://www.sbs.com.au/api/v3';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const smilUrl = update_url_query(`${SBSIE._PLAYER_API}/video_smil`, { id: videoId });
    const smil = await this._download_webpage(smilUrl, videoId, 'Downloading SMIL');
    const mediaUrls = extractSmilMediaUrls(smil);
    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    for (const mediaUrl of mediaUrls) {
      if (/\.m3u8/i.test(mediaUrl)) {
        const res = await extractM3u8FormatsAndSubtitles(this, mediaUrl, videoId, 'hls');
        formats.push(...res.formats);
        subtitles = { ...subtitles, ...res.subtitles };
      }
    }

    if (!formats.length) {
      const head = await this._request_webpage(smilUrl.replace('video_smil', ''), videoId, undefined, {
        fatal: false,
      });
      if (head) this.raise_geo_restricted(undefined, ['AU']);
      throw new ExtractorError('No formats are available', { expected: true });
    }

    const streamJson = await this._download_json<{ video_object?: Record<string, unknown> }>(
      `${SBSIE._PLAYER_API}/video_stream`,
      videoId,
      undefined,
      { query: { id: videoId, context: 'tv' }, fatal: false },
    );
    let media: Record<string, unknown> = streamJson?.video_object || {};
    const catalogue = await this._download_json<Record<string, unknown>>(
      `https://catalogue.pr.sbsod.com/mpx-media/${videoId}`,
      videoId,
      undefined,
      { fatal: !Object.keys(media).length },
    );
    media = { ...media, ...catalogue };

    if (media.partOfSeries) media.epName = media.title;

    const fixedSubtitles: Record<string, Subtitle[]> = {};
    for (const [lang, subs] of Object.entries(subtitles)) {
      for (const sub of subs) {
        let fixedLang = lang;
        if (sub.url?.toLowerCase().endsWith('_fe.vtt')) fixedLang += '-forced';
        (fixedSubtitles[fixedLang] ||= []).push(sub);
      }
    }

    const classification = String(media.classificationID || media.contentRating || '').toUpperCase();

    return {
      id: videoId,
      title: media.name as string | undefined,
      description: media.description as string | undefined,
      channel: traverse_obj(media, ['taxonomy', 'channel', 'name']) as string | undefined,
      series: (media.partOfSeries as Record<string, unknown>)?.name as string | undefined || (media.seriesTitle as string | undefined),
      series_id: ((media.partOfSeries as Record<string, unknown>)?.uuid as string | undefined) || (media.seriesID as string | undefined),
      season_number: int_or_none(media.seasonNumber) ?? undefined,
      episode: media.epName as string | undefined,
      episode_number: int_or_none(media.episodeNumber) ?? undefined,
      timestamp: parseIso8601(media.datePublished || (media.publication as Record<string, unknown>)?.startDate) ?? undefined,
      release_year: int_or_none(media.releaseYear) ?? undefined,
      duration: parse_duration(float_or_none(media.duration)) ?? undefined,
      is_live: media.liveStream as boolean | undefined,
      age_limit: AUS_TV[classification],
      formats,
      subtitles: fixedSubtitles,
      uploader: 'SBSC',
    };
  }
}

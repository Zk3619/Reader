/**
 * DuoplayIE — ported from yt-dlp duoplay.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes, int_or_none, join_nonempty, parse_qs, str_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class DuoplayIE extends InfoExtractor {
  static IE_NAME = 'duoplay';
  static _VALID_URL = /https?:\/\/duoplay\.ee\/(?<id>\d+)(?:[/?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const telecastId = this._match_id(url);
    const qs = parse_qs(url);
    const episode = str_or_none(qs.ep?.[0] ? int_or_none(qs.ep[0]) : null);
    const videoId = join_nonempty(telecastId, episode, '_') || telecastId;
    const webpage = await this._download_webpage(url, videoId);

    const playerMatch = webpage.match(/<video-player\b([^>]*)>/i);
    const videoPlayer = playerMatch ? extract_attributes(playerMatch[1] || '') : null;
    if (!videoPlayer?.['manifest-url']) {
      throw new ExtractorError('No video found', { expected: true });
    }

    const manifestUrl = videoPlayer['manifest-url'];
    const session = await this._download_json<{ session: string }>(
      'https://sts.postimees.ee/session/register',
      videoId,
      'Registering session',
      {
        headers: { Accept: 'application/json', 'X-Original-URI': manifestUrl },
        fatal: true,
      },
    );

    const episodeAttr = this._parse_json<Record<string, unknown>>(
      videoPlayer[':episode'] || '',
      videoId,
      null,
      false,
    ) || {};

    const signedManifest = `${manifestUrl}${manifestUrl.includes('?') ? '&' : '?'}s=${session.session}`;
    const formats = await this._extract_m3u8_formats(signedManifest, videoId, 'mp4', 'm3u8_native');

    const base: VideoInfo = {
      id: videoId,
      formats,
      title: str_or_none(episodeAttr.title) ?? undefined,
      description: str_or_none(episodeAttr.synopsis) ?? undefined,
      thumbnail: ((episodeAttr.images as Record<string, string>) || {}).original,
      timestamp: episodeAttr.airtime
        ? parseIso8601(`${episodeAttr.airtime} +0200`) ?? undefined
        : undefined,
      cast: episodeAttr.cast
        ? String(episodeAttr.cast)
            .split(', ')
            .filter(Boolean)
        : undefined,
      release_year: int_or_none(episodeAttr.year) ?? undefined,
    };

    if (episodeAttr.category !== 'movies') {
      Object.assign(base, {
        title: str_or_none(episodeAttr.subtitle) || (episode ? `Episode ${episode}` : base.title),
        series: str_or_none(episodeAttr.title) ?? undefined,
        series_id: str_or_none(episodeAttr.telecast_id) ?? undefined,
        season_number: int_or_none(episodeAttr.season_id) ?? undefined,
        episode: str_or_none(episodeAttr.subtitle) ?? undefined,
        episode_number: int_or_none(episodeAttr.episode_nr) ?? undefined,
        episode_id: str_or_none(episodeAttr.episode_id) ?? undefined,
      });
    }

    return base;
  }
}

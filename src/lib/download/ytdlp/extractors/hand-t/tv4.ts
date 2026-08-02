/**
 * TV4IE — ported from yt-dlp tv4.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { bool_or_none, int_or_none, traverse_obj, url_or_none } from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  mergeSubtitles,
  parseIso8601,
} from './_helpers';

export class TV4IE extends InfoExtractor {
  static IE_DESC = 'tv4.se and tv4play.se';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:tv4\.se\/[^/]+\/klipp\/(?:.*)-|tv4play\.se\/(?:program|barn)\/(?:(?:[^/]+\/){1,2}|(?:[^\?]+)\?video_id=)|iframe\/video\/|film\/|sport\/)(?<id>[0-9]+)/;

  protected async _callApi(endpoint: string, videoId: string, query: Record<string, string> = {}) {
    return this._download_json<Record<string, unknown>>(
      `https://playback2.a2d.tv/${endpoint}/${videoId}`,
      videoId,
      undefined,
      {
        query: { service: 'tv4', device: 'browser', protocol: 'hls', ...query },
        headers: this.geo_verification_headers(),
      },
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const info =
      (traverse_obj(
        await this._callApi('asset', videoId, { protocol: 'hls,dash', drm: 'widevine' }),
        ['metadata'],
      ) as Record<string, unknown>) || {};

    const manifestUrl = traverse_obj(
      await this._callApi('play', videoId),
      ['playbackItem', 'manifestUrl'],
    ) as string;

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    const hls = await extractM3u8FormatsAndSubtitles(this, manifestUrl, videoId, 'hls');
    formats.push(...hls.formats);
    mergeSubtitles(subtitles, hls.subtitles);

    const mpd = await extractMpdFormatsAndSubtitles(this, manifestUrl.replace('.m3u8', '.mpd'), videoId, 'dash');
    formats.push(...mpd.formats);
    mergeSubtitles(subtitles, mpd.subtitles);

    if (!formats.length && info.is_geo_restricted) {
      this.raise_geo_restricted(
        'This video is not available from your location due to geo-restriction, or not being authenticated',
        ['SE'],
      );
    }

    return {
      id: videoId,
      formats,
      subtitles,
      title: info.title != null ? String(info.title) : undefined,
      description: info.description != null ? String(info.description) : undefined,
      timestamp:
        parseIso8601(info.broadcast_date_time) ?? parseIso8601(info.broadcastDateTime) ?? undefined,
      duration: int_or_none(info.duration) ?? undefined,
      thumbnail: url_or_none(info.image) || undefined,
      is_live: bool_or_none(info.isLive) ?? undefined,
      series: info.seriesTitle != null ? String(info.seriesTitle) : undefined,
      season_number: int_or_none(info.seasonNumber) ?? undefined,
      episode: info.episodeTitle != null ? String(info.episodeTitle) : undefined,
      episode_number: int_or_none(info.episodeNumber) ?? undefined,
    };
  }
}

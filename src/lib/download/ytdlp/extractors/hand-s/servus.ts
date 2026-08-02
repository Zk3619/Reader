/** ServusIE — ported from yt-dlp servus.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  join_nonempty,
  traverse_obj,
  unescapeHTML,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, searchNextjsData } from './_helpers';

export class ServusIE extends InfoExtractor {
  static IE_NAME = 'servus';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:servus\.com\/(?:(?:at|de)\/p\/[^/]+|tv\/videos)|(?:servustv|pm-wissen)\.com\/(?:[^/]+\/)?v(?:ideos)?)\/(?<id>[aA]{2}-?\w+|\d+-\d+)/;

  protected _getDescription(nextData: Record<string, unknown> | null): string | undefined {
    if (!nextData) return undefined;
    const pageProps = (nextData.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined;
    const data = pageProps?.data as Record<string, unknown> | undefined;
    if (!data) return undefined;
    return join_nonempty(
      unescapeHTML(String(data.stv_short_description || '')).replace(/\n\n/g, '\n'),
      unescapeHTML(String(data.stv_long_description || '')).replace(/\n\n/g, '\n'),
      '\n\n',
    ) || undefined;
  }

  protected _reportErrors(video: Record<string, unknown>): never {
    const playabilityErrors = (video.playabilityErrors as string[]) || [];
    if (!playabilityErrors.length) {
      throw new ExtractorError('No videoUrl and no information about errors');
    }
    let message: string;
    if (playabilityErrors.includes('FSK_BLOCKED')) {
      const details = (video.playabilityErrorDetails as Record<string, Record<string, unknown>>)?.FSK_BLOCKED || {};
      message =
        `Only available${details.minEveningHour != null ? ` from ${String(details.minEveningHour).padStart(2, '0')}:00` : ''}${details.maxMorningHour != null ? ` to ${String(details.maxMorningHour).padStart(2, '0')}:00` : ''}${details.minAge != null ? ` (Minimum age ${details.minAge})` : ''}` ||
        'Blocked by FSK with unknown availability';
    } else if (playabilityErrors.includes('NOT_YET_AVAILABLE')) {
      const details = (video.playabilityErrorDetails as Record<string, Record<string, unknown>>)?.NOT_YET_AVAILABLE;
      const from = details?.availableFrom || video.currentSunrise;
      message = from ? `Only available from ${from}` : 'Video not yet available with unknown availability';
    } else {
      message = `Video unavailable: ${playabilityErrors.join(', ')}`;
    }
    throw new ExtractorError(message, { expected: true });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url).toUpperCase();
    const webpage = await this._download_webpage(url, videoId);
    const nextData = searchNextjsData(this, webpage, videoId);

    const video = await this._download_json<Record<string, unknown>>(
      'https://api-player.redbull.com/stv/servus-tv-playnet',
      videoId,
      'Downloading video JSON',
      { query: { videoId } },
    );
    if (!video.videoUrl) this._reportErrors(video);

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      String(video.videoUrl),
      videoId,
      'hls',
    );

    const season = video.season as string | undefined;
    const seasonNumber = int_or_none(/Season (\d+)/.exec(season || '')?.[1]) ?? undefined;
    const episode = video.chapter as string | undefined;
    const episodeNumber = int_or_none(/Episode (\d+)/.exec(episode || '')?.[1]) ?? undefined;

    const pageData = traverse_obj(nextData, ['props', 'pageProps', 'data']) as Record<string, unknown> | undefined;

    return {
      id: videoId,
      title: (pageData?.title as Record<string, unknown>)?.rendered as string | undefined || (video.title as string | undefined),
      description: this._getDescription(nextData) || (video.description as string | undefined),
      thumbnail: video.poster as string | undefined,
      duration: float_or_none(video.duration) ?? undefined,
      timestamp: int_or_none(pageData?.stv_date && (pageData.stv_date as Record<string, unknown>).raw) ?? undefined,
      series: video.label as string | undefined,
      season,
      season_number: seasonNumber,
      episode,
      episode_number: episodeNumber,
      formats,
      subtitles,
      categories: (pageData?.category_names as string[]) || undefined,
    };
  }
}

/**
 * NewsPicksIE — ported from yt-dlp newspicks.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, parse_qs, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601, searchNextjsData } from './_helpers';

export class NewsPicksIE extends InfoExtractor {
  static IE_NAME = 'newspicks';
  static _VALID_URL =
    /https?:\/\/newspicks\.com\/movie-series\/(?<id>[^?/#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const seriesId = this._match_id(url);
    const movieIds = parse_qs(url).movieId;
    const videoId = movieIds?.[movieIds.length - 1];
    if (!videoId) throw new ExtractorError('Unable to extract movie ID');

    const webpage = await this._download_webpage(url, videoId);
    const fragment = searchNextjsData(this, webpage, videoId).pageProps as Record<string, unknown>;
    const pageProps = (fragment?.fragment as Record<string, unknown>) || (fragment as Record<string, unknown>);
    const movie = (pageProps?.movie as Record<string, unknown>) || {};

    if (String(movie.viewable) === 'PARTIAL_FREE' && !movie.canWatch) {
      this.report_warning(
        `Full video is for Premium members. Without cookies, only the preview is downloaded. [${videoId}]`,
      );
    }

    const m3u8Url = url_or_none(movie.movieUrl);
    if (!m3u8Url) throw new ExtractorError('Unable to extract m3u8 URL');

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'mp4');
    const series = pageProps?.series as Record<string, unknown> | undefined;

    return {
      id: videoId,
      formats,
      series: series?.title as string | undefined,
      series_id: seriesId,
      subtitles,
      title: movie.title as string | undefined,
      description: clean_html(String(movie.explanation ?? '')) || undefined,
      release_timestamp: parseIso8601(movie.onAirStartDate) ?? undefined,
      thumbnail:
        url_or_none(movie.image) || url_or_none(movie.coverImageUrl) || undefined,
      timestamp: parseIso8601(movie.published) ?? undefined,
    };
  }
}

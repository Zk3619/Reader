/**
 * FreeTvBase / FreeTv / FreeTvMovies ??ported from yt-dlp freetv.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, urlencodePostdata } from './_helpers';

export class FreeTvBaseIE extends InfoExtractor {
  static IE_NAME = 'freetvbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('FreeTvBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _getApiResponse(
    contentId: string,
    resourceType: string,
    postdata: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const res = await this._download_json<{ data?: Record<string, unknown> }>(
      'https://www.freetv.com/wordpress/wp-admin/admin-ajax.php',
      contentId,
      `Downloading ${contentId} ${resourceType} JSON`,
      {
        data: urlencodePostdata(postdata),
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
    return res.data || {};
  }
}

export class FreeTvMoviesIE extends FreeTvBaseIE {
  static IE_NAME = 'freetvmovies';
  static _VALID_URL = /https?:\/\/(?:www\.)?freetv\.com\/peliculas\/(?<id>[^/]+)/;

  protected async _extractVideo(contentId: string, action = 'olyott_video_play'): Promise<VideoInfo> {
    const apiResponse = await this._getApiResponse(contentId, 'video', {
      action,
      contentID: contentId,
    });
    const displayMeta = (apiResponse.displayMeta as Record<string, unknown>) || {};
    const videoId = String(displayMeta.contentID ?? contentId);
    const videoUrl = String(displayMeta.streamURLVideo ?? '');
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, videoUrl, videoId);

    return {
      id: videoId,
      title: displayMeta.title as string | undefined,
      description: displayMeta.desc as string | undefined,
      formats,
      subtitles,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const contentId = this._search_regex(
      [
        /class=["'][^>]+postid-(?<video_id>\d+)/,
        /<link[^>]+freetv.com\/\?p=(?<video_id>\d+)/,
        /<div[^>]+data-params=["'][^>]+post_id=(?<video_id>\d+)/,
      ],
      webpage,
      'video id',
      'video_id',
    );
    return this._extractVideo(contentId!);
  }
}

export class FreeTvIE extends FreeTvBaseIE {
  static IE_NAME = 'freetv:series';
  static _VALID_URL = /https?:\/\/(?:www\.)?freetv\.com\/series\/(?<id>[^/]+)/;

  protected async *_extractSeriesSeason(seasonId: string, seriesTitle?: string): AsyncGenerator<VideoInfo> {
    const episodes = (
      await this._getApiResponse(seasonId, 'series', {
        contentID: seasonId,
        action: 'olyott_get_dynamic_series_content',
        type: 'list',
        perPage: '1000',
      })
    )['1'] as Array<Record<string, unknown>>;

    for (const episode of episodes || []) {
      const videoId = String(episode.contentID ?? '');
      const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
        this,
        String(episode.streamURL ?? ''),
        videoId,
      );
      const contentMeta = (episode.contentMeta as Record<string, unknown>) || {};
      const displayMeta = (contentMeta.displayMeta as Record<string, unknown>) || {};
      yield {
        id: videoId,
        title: episode.fullTitle as string | undefined,
        description: episode.description as string | undefined,
        formats,
        subtitles,
        thumbnail: episode.thumbnail as string | undefined,
        series: seriesTitle,
        series_id: traverse_obj(displayMeta, ['seriesID', String]) as string | undefined,
        season_id: traverse_obj(displayMeta, ['seasonID', String]) as string | undefined,
        season_number: int_or_none(displayMeta.seasonNum) ?? undefined,
        episode_number: int_or_none(displayMeta.episodeNum) ?? undefined,
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const title = this._html_search_regex(
      /<h1[^>]+class=["']synopis[^>]>(?<title>[^<]+)/,
      webpage,
      'title',
      'title',
      false,
    );
    const description = this._html_search_regex(
      /<div[^>]+class=["']+synopis content[^>]><p>(?<description>[^<]+)/,
      webpage,
      'description',
      'description',
      false,
    );
    const seasonIds = [...webpage.matchAll(/<option[^>]+value=["'](\d+)["']/g)].map((m) => m[1]!);
    const entries: VideoInfo[] = [];
    for (const seasonId of seasonIds) {
      for await (const entry of this._extractSeriesSeason(seasonId, title || undefined)) {
        entries.push(entry);
      }
    }
    return this.playlist_result(entries, displayId, title || undefined, description || undefined);
  }
}

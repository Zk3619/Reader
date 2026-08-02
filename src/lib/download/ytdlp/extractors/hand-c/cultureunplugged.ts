/**
 * CultureUnpluggedIE — ported from yt-dlp cultureunplugged.py
 */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class CultureUnpluggedIE extends InfoExtractor {
  static IE_NAME = 'cultureunplugged';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?cultureunplugged\.com\/(?:documentary\/watch-online\/)?play\/(?<id>\d+)(?:\/(?<display_id>[^/#?]+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.display_id || videoId;

    const movieData = await this._download_json<Record<string, unknown>>(
      `http://www.cultureunplugged.com/movie-data/cu-${videoId}.json`,
      displayId,
    );

    const thumbnails: Thumbnail[] = [];
    (['small', 'large'] as const).forEach((size, preference) => {
      const thumbUrl = movieData[`${size}_thumb`] as string | undefined;
      if (thumbUrl) thumbnails.push({ url: thumbUrl, id: size, preference });
    });

    return {
      id: videoId,
      display_id: displayId,
      url: movieData.url as string,
      title: movieData.title as string,
      description: (movieData.synopsis as string) || undefined,
      creator: (movieData.producer as string) || undefined,
      duration: int_or_none(movieData.duration) ?? undefined,
      view_count: int_or_none(movieData.views) ?? undefined,
      thumbnails,
    } as VideoInfo;
  }
}

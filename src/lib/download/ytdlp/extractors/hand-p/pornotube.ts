/** PornotubeIE — ported from yt-dlp pornotube.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class PornotubeIE extends InfoExtractor {
  static IE_NAME = 'pornotube';
  static _VALID_URL =
    /https?:\/\/(?:\w+\.)?pornotube\.com\/(?:[^?#]*?)\/video\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const token = (
      await this._download_json<{ tokenKey?: string }>(
        'https://api.aebn.net/auth/v2/origins/authenticate',
        videoId,
        'Downloading token',
        {
          method: 'POST',
          data: JSON.stringify({ credentials: 'Clip Application' }),
          headers: { 'Content-Type': 'application/json', Origin: 'http://www.pornotube.com' },
        },
      )
    ).tokenKey;

    const videoUrl = (
      await this._download_json<{ mediaUrl?: string }>(
        `https://api.aebn.net/delivery/v1/clips/${videoId}/MP4`,
        videoId,
        'Downloading delivery information',
        { headers: { Authorization: token! } },
      )
    ).mediaUrl;

    const fields = [
      'title', 'description', 'startSecond', 'endSecond', 'publishDate',
      'studios{name}', 'categories{name}', 'movieId', 'primaryImageNumber',
    ];
    let info = await this._download_json<Record<string, unknown> | Record<string, unknown>[]>(
      `https://api.aebn.net/content/v2/clips/${videoId}?fields=${fields.join(',')}`,
      videoId,
      'Downloading metadata',
      { headers: { Authorization: token! } },
    );
    if (Array.isArray(info)) info = info[0] || {};

    const studios = (info.studios as Array<{ name?: string }>) || [];
    const movieId = info.movieId;
    const primaryImageNumber = info.primaryImageNumber;
    const start = int_or_none(info.startSecond);
    const end = int_or_none(info.endSecond);

    return {
      id: videoId,
      url: videoUrl!,
      title: String(info.title ?? ''),
      description: (info.description as string) ?? undefined,
      duration: start && end ? end - start : undefined,
      timestamp: int_or_none(info.publishDate, 1000) ?? undefined,
      uploader: studios[0]?.name,
      thumbnail:
        movieId && primaryImageNumber
          ? `http://pic.aebn.net/dis/t/${movieId}/${movieId}_${String(primaryImageNumber).padStart(8, '0')}.jpg`
          : undefined,
      categories: ((info.categories as Array<{ name?: string }>) || [])
        .map((c) => c.name)
        .filter(Boolean) as string[],
      age_limit: 18,
    };
  }
}

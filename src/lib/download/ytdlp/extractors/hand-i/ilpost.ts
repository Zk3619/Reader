/**
 * IlPostIE — ported from yt-dlp ilpost.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, int_or_none, traverse_obj, url_or_none } from '../../utils';
import { urlencodePostdata } from './_helpers';

export class IlPostIE extends InfoExtractor {
  static IE_NAME = 'ilpost';
  static _VALID_URL = /https?:\/\/(?:www\.)?ilpost\.it\/episodes\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const endpointMetadata = this._search_json<Record<string, string>>(
      /var\s+ilpostpodcast\s*=/,
      webpage,
      'metadata',
      displayId,
    )!;
    const episodeId = endpointMetadata.post_id!;
    const podcastId = endpointMetadata.podcast_id!;

    const podcastMetadata = await this._download_json<Record<string, unknown>>(
      endpointMetadata.ajax_url!,
      displayId,
      undefined,
      {
        data: urlencodePostdata({
          action: 'checkpodcast',
          cookie: endpointMetadata.cookie!,
          post_id: episodeId,
          podcast_id: podcastId,
        }),
      },
    );

    const episodeList =
      (traverse_obj(podcastMetadata, ['data', 'postcastList']) as Array<Record<string, unknown>>) || [];
    const episode = episodeList.find((row) => String(row.id) === episodeId);

    if (!episode) throw new ExtractorError('Episode could not be extracted', { expected: true });

    return {
      id: episodeId,
      display_id: displayId,
      series_id: podcastId,
      vcodec: 'none',
      title: episode.title as string | undefined,
      description: episode.description as string | undefined,
      url: url_or_none(episode.podcast_raw_url) ?? undefined,
      thumbnail: url_or_none(episode.image) ?? undefined,
      timestamp: int_or_none(episode.timestamp) ?? undefined,
      duration: float_or_none(episode.milliseconds, 1000) ?? undefined,
      availability: episode.free ? 'public' : 'subscriber_only',
    };
  }
}

/** RadioZetPodcastIE — ported from yt-dlp radiozet.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { strip_or_none } from './_helpers';

export class RadioZetPodcastIE extends InfoExtractor {
  static IE_NAME = 'RadioZetPodcast';
  static _VALID_URL = /https?:\/\/player\.radiozet\.pl\/Podcasty\/.*?\/(?<id>.+)/;

  protected async _callApi(podcastId: string, displayId: string) {
    return this._download_json<{ data?: Array<Record<string, unknown>> }>(
      `https://player.radiozet.pl/api/podcasts/getPodcast/(node)/${podcastId}/(station)/radiozet`,
      displayId,
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const podcastId = this._html_search_regex(
      /<div.*?\sid="player".*?\sdata-id=['"]([^'"]+)['"]/,
      webpage,
      'podcast id',
    )!;
    const data = (await this._callApi(podcastId, displayId)).data?.[0] || {};

    return {
      id: podcastId,
      display_id: displayId,
      title: strip_or_none(data.title as string) ?? undefined,
      description: strip_or_none(traverse_obj(data, ['program', 'desc']) as string) ?? undefined,
      release_timestamp: data.published_date as number | undefined,
      url: traverse_obj(data, ['player', 'stream']) as string | undefined,
      thumbnail: traverse_obj(data, ['program', 'image', 'original']) as string | undefined,
      duration: traverse_obj(data, ['player', 'duration']) as number | undefined,
      series: strip_or_none(traverse_obj(data, ['program', 'title']) as string) ?? undefined,
      creator: strip_or_none(traverse_obj(data, ['presenter', 0, 'title']) as string) ?? undefined,
    };
  }
}

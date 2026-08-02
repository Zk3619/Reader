/** ToonGogglesIE — ported from yt-dlp toongoggles.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, parse_duration } from '../../utils';

export class ToonGogglesIE extends InfoExtractor {
  static _VALID_URL =
    /https?:\/\/(?:www\.)?toongoggles\.com\/shows\/(?<show_id>\d+)(?:\/[^/]+\/episodes\/(?<episode_id>\d+))?/;

  protected async _callApi(
    action: string,
    pageId: string,
    query: Record<string, string | number>,
  ): Promise<Record<string, unknown>> {
    return this._download_json(`http://api.toongoggles.com/${action}`, pageId, undefined, {
      query: {
        ...query,
        for_ng: '1',
        for_web: '1',
        show_meta: '1',
        version: '7.0',
      },
    });
  }

  protected _parseEpisodeData(episodeData: Record<string, unknown>): VideoInfo {
    const title = String(episodeData.episode_name || '');
    return {
      _type: 'url_transparent',
      id: String(episodeData.episode_id || ''),
      title,
      url: `kaltura:513551:${episodeData.entry_id}`,
      thumbnail: episodeData.thumbnail_url ? String(episodeData.thumbnail_url) : undefined,
      description: episodeData.description ? String(episodeData.description) : undefined,
      duration: parse_duration(String(episodeData.hms || '')) ?? undefined,
      series: episodeData.show_name ? String(episodeData.show_name) : undefined,
      season_number: int_or_none(episodeData.season_num) ?? undefined,
      episode_id: episodeData.episode_id ? String(episodeData.episode_id) : undefined,
      episode: title,
      episode_number: int_or_none(episodeData.episode_num) ?? undefined,
      categories: episodeData.categories as string[] | undefined,
      ie_key: 'Kaltura',
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const showId = m.groups!.show_id!;
    const episodeId = m.groups!.episode_id;

    if (episodeId) {
      const episodeData = (
        (await this._callApi('search', episodeId, { filter: 'episode', id: episodeId })) as {
          objects?: Array<Record<string, unknown>>;
        }
      ).objects?.[0];
      if (!episodeData) throw new Error('Episode not found');
      return this._parseEpisodeData(episodeData);
    }

    const showData = await this._callApi('getepisodesbyshow', showId, {
      max: 1000000000,
      showid: showId,
    });
    const entries = ((showData.objects as Array<Record<string, unknown>>) || []).map((ep) =>
      this._parseEpisodeData(ep),
    );
    return this.playlist_result(
      entries,
      showId,
      showData.show_name ? String(showData.show_name) : undefined,
    );
  }
}

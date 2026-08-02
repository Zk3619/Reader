/**
 * AlJazeeraIE — aligned with yt-dlp aljazeera.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { try_get } from '../../utils';

export class AlJazeeraIE extends InfoExtractor {
  static IE_NAME = 'aljazeera';
  static _VALID_URL =
    /https?:\/\/(?<base>\w+\.aljazeera\.\w+)\/(?<type>programs?\/[^/]+|(?:feature|video|new)s)?\/\d{4}\/\d{1,2}\/\d{1,2}\/(?<id>[^/?&#]+)/i;

  static BRIGHTCOVE_URL_RE =
    /https?:\/\/players\.brightcove\.net\/(?<account>\d+)\/(?<player_id>[a-zA-Z0-9]+)_(?<embed>[^/]+)\/index\.html\?videoId=(?<video_id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const base = m!.groups!.base as string;
    const postTypeRaw = (m!.groups!.type as string | undefined) || 'news';
    const displayId = m!.groups!.id as string;

    const wpMap: Record<string, string> = {
      'balkans.aljazeera.net': 'ajb',
      'chinese.aljazeera.net': 'chinese',
      'mubasher.aljazeera.net': 'ajm',
    };
    const wp = wpMap[base] || 'aje';
    const postTypeHead = postTypeRaw.split('/')[0] || 'news';
    const postTypeMap: Record<string, string> = {
      features: 'post',
      feature: 'post',
      program: 'episode',
      programs: 'episode',
      videos: 'video',
      video: 'video',
      news: 'news',
    };
    const postType = postTypeMap[postTypeHead] || 'news';

    const videoPayload = await this._download_json<Record<string, unknown>>(
      `https://${base}/graphql`,
      displayId,
      'Downloading Al Jazeera GraphQL',
      {
        query: {
          'wp-site': wp,
          operationName: 'ArchipelagoSingleArticleQuery',
          variables: JSON.stringify({ name: displayId, postType }),
        },
        headers: { 'wp-site': wp },
      },
    );

    const video =
      (try_get(videoPayload, (x) => (x.data as Record<string, unknown>)?.article as Record<string, unknown>)
        ?.video as Record<string, unknown>) || {};

    let videoId = video.id as string | number | undefined;
    let account = (video.accountId as string | undefined) || '911432371001';
    let playerId = (video.playerId as string | undefined) || 'csvTfAlKW';
    let embed = 'default';

    if (videoId == null) {
      const webpage = await this._download_webpage(url, displayId);
      const bc = webpage.match(AlJazeeraIE.BRIGHTCOVE_URL_RE);
      if (!bc?.groups?.video_id) {
        return this.url_result(url, 'Generic');
      }
      account = bc.groups.account as string;
      playerId = bc.groups.player_id as string;
      embed = bc.groups.embed as string;
      videoId = bc.groups.video_id as string;
    }

    return this.url_result(
      `https://players.brightcove.net/${account}/${playerId}_${embed}/index.html?videoId=${videoId}`,
      'BrightcoveNew',
    );
  }
}

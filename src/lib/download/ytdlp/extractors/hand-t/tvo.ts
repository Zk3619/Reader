/**
 * TvoIE — ported from yt-dlp tvo.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  parse_duration,
  smuggle_url,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { parseIso8601 } from './_helpers';

const BRIGHTCOVE_URL_TEMPLATE =
  'https://players.brightcove.net/18140038001/default_default/index.html?videoId=%s';

export class TvoIE extends InfoExtractor {
  static IE_NAME = 'TVO';
  static _VALID_URL = /https?:\/\/(?:www\.)?tvo\.org\/video(?:\/documentaries)?\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const slugPath = new URL(url).pathname.replace(/\/$/, '');
    const videoData = (
      await this._download_json<{ data: { getTVOOrgVideo: Record<string, unknown> } }>(
        'https://hmy0rc1bo2.execute-api.ca-central-1.amazonaws.com/graphql',
        displayId,
        undefined,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({
            operationName: 'getVideo',
            variables: { slug: slugPath },
            query: `query getVideo($slug: String) {
              getTVOOrgVideo(slug: $slug) {
                contentCategory description length programOrder publishedAt season tags thumbnail title
                program { nodeUrl title }
                videoSource { brightcoveRefId }
              }
            }`,
          }),
        },
      )
    ).data.getTVOOrgVideo;

    const brightcoveId = str_or_none(
      traverse_obj(videoData, ['videoSource', 'brightcoveRefId']),
    );
    if (!brightcoveId) {
      throw new Error('Brightcove ID not found');
    }

    const program = (videoData.program as Record<string, unknown>) || {};
    const seriesIdRaw = program.nodeUrl != null ? String(program.nodeUrl) : '';
    const seriesId = seriesIdRaw.replace(/^\/programs\//, '');

    return {
      _type: 'url_transparent',
      ie_key: 'BrightcoveNew',
      url: smuggle_url(BRIGHTCOVE_URL_TEMPLATE.replace('%s', brightcoveId), { geo_countries: ['CA'] }),
      id: brightcoveId,
      display_id: displayId,
      episode_id: displayId,
      title: clean_html(String(videoData.title || '')) || undefined,
      categories: videoData.contentCategory
        ? [clean_html(String(videoData.contentCategory))].filter((s): s is string => !!s)
        : undefined,
      description: clean_html(String(videoData.description || '')) || undefined,
      duration: parse_duration(videoData.length) ?? undefined,
      episode: clean_html(String(videoData.title || '')) || undefined,
      episode_number: int_or_none(videoData.programOrder) ?? undefined,
      season_number: int_or_none(videoData.season) ?? undefined,
      tags: Array.isArray(videoData.tags)
        ? videoData.tags.map((t) => clean_html(String(t))).filter((s): s is string => !!s)
        : undefined,
      thumbnail: url_or_none(videoData.thumbnail) || undefined,
      timestamp: parseIso8601(videoData.publishedAt) ?? undefined,
      series: clean_html(String(program.title || '')) || undefined,
      series_id: seriesId || undefined,
    };
  }
}

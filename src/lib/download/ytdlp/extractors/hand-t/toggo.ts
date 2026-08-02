/** ToggoIE — ported from yt-dlp toggo.py */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { int_or_none, parse_qs } from '../../utils';

export class ToggoIE extends InfoExtractor {
  static IE_NAME = 'toggo';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?toggo\.de\/(?:toggolino\/)?[^/?#]+\/(?:folge|video)\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const data = (
      await this._download_json<{ data: Record<string, unknown> }>(
        `https://production-n.toggo.de/api/assetstore/vod/asset/${displayId}`,
        displayId,
      )
    ).data;

    const customFields = (data.custom_fields as Array<Record<string, unknown>>) || [];
    const brightcoveId = String(
      customFields.find((x) => x.key === 'video-cloud-id')?.value || '',
    );
    if (!brightcoveId) throw new Error('Brightcove video ID not found');

    const brightcoveUrl = `http://players.brightcove.net/6057955896001/default_default/index.html?videoId=${brightcoveId}`;

    const thumbnails: Thumbnail[] = [];
    for (const [name, thumbUrl] of Object.entries((data.images as Record<string, string>) || {})) {
      thumbnails.push({
        id: name,
        url: thumbUrl,
        width: int_or_none(parse_qs(thumbUrl).width?.[0]) ?? undefined,
      });
    }

    return {
      _type: 'url_transparent',
      ie_key: 'BrightcoveNew',
      url: brightcoveUrl,
      id: String(data.id || brightcoveId),
      display_id: displayId,
      title: data.title ? String(data.title) : undefined,
      language: data.language ? String(data.language) : undefined,
      thumbnails,
      description: data.description ? String(data.description) : undefined,
      release_timestamp: int_or_none(data.earliest_start_date) ?? undefined,
      series: data.series_title ? String(data.series_title) : undefined,
      season: data.season_title ? String(data.season_title) : undefined,
      season_number: int_or_none(data.season_no) ?? undefined,
      season_id: data.season_id ? String(data.season_id) : undefined,
      episode: data.title ? String(data.title) : undefined,
      episode_number: int_or_none(data.episode_no) ?? undefined,
      episode_id: data.id ? String(data.id) : undefined,
    };
  }
}

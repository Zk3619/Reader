/**
 * MySpassIE — ported from yt-dlp myspass.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, parse_duration } from '../../utils';
import { xmlTagText } from './_helpers';

export class MySpassIE extends InfoExtractor {
  static IE_NAME = 'myspass';
  static _VALID_URL = /https?:\/\/(?:www\.)?myspass\.de\/(?:[^/]+\/)*(?<id>\d+)\/?[^/]*$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const metadata = await this._download_webpage(
      `http://www.myspass.de/myspass/includes/apps/video/getvideometadataxml.php?id=${videoId}`,
      videoId,
    );

    const title = xmlTagText(metadata, 'title');
    if (!title) throw new Error('Missing title in metadata');
    let videoUrl = xmlTagText(metadata, 'url_flv');
    if (!videoUrl) throw new Error('Missing download url');

    const videoIdInt = Number(videoId);
    const groups = videoUrl.match(/\/myspass2009\/\d+\/(\d+)\/(\d+)\/(\d+)\//);
    if (groups) {
      for (const group of groups.slice(1)) {
        const groupInt = Number(group);
        if (groupInt > videoIdInt) {
          videoUrl = videoUrl.replace(group, String(Math.floor(groupInt / videoIdInt)));
        }
      }
    }

    return {
      id: videoId,
      url: videoUrl,
      title,
      thumbnail: xmlTagText(metadata, 'imagePreview') || undefined,
      description: xmlTagText(metadata, 'description') || undefined,
      duration: parse_duration(xmlTagText(metadata, 'duration') || '') ?? undefined,
      series: xmlTagText(metadata, 'format') || undefined,
      season_number: int_or_none(xmlTagText(metadata, 'season') || '') ?? undefined,
      season_id: xmlTagText(metadata, 'season_id') || undefined,
      episode: title,
      episode_number: int_or_none(xmlTagText(metadata, 'episode') || '') ?? undefined,
    };
  }
}

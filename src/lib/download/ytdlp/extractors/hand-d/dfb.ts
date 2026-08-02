/**
 * DFBIE — ported from yt-dlp dfb.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { unified_strdate } from '../../utils';
import { xmlTagText } from './_helpers';

function protoRelative(u: string): string {
  return u.startsWith('//') ? `https:${u}` : u;
}

export class DFBIE extends InfoExtractor {
  static IE_NAME = 'tv.dfb.de';
  static _VALID_URL = /https?:\/\/tv\.dfb\.de\/video\/(?<display_id>[^/]+)\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.display_id!;
    const videoId = m.groups!.id!;

    const playerInfo = await this._download_webpage(
      `http://tv.dfb.de/server/hd_video.php?play=${videoId}`,
      displayId,
    );
    const streamAccessUrl = protoRelative(xmlTagText(playerInfo, 'url') || '');
    const title = xmlTagText(playerInfo, 'title') || displayId;
    const timeDate = xmlTagText(playerInfo, 'time_date');

    const formats: Format[] = [];
    for (const saUrl of [streamAccessUrl, `${streamAccessUrl}&area=&format=iphone`]) {
      const streamAccessInfo = await this._download_webpage(saUrl, displayId);
      const tokenUrl = streamAccessInfo.match(/<token[^>]+url="([^"]+)"/i)?.[1];
      const tokenAuth = streamAccessInfo.match(/<token[^>]+auth="([^"]+)"/i)?.[1];
      if (!tokenUrl || !tokenAuth) continue;
      const manifestUrl = `${tokenUrl}?hdnea=${tokenAuth}`;
      if (manifestUrl.includes('.f4m')) {
        this.report_warning('HDS (f4m) formats are not supported');
        continue;
      }
      formats.push(
        ...(await this._extract_m3u8_formats(manifestUrl, displayId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }

    return {
      id: videoId,
      display_id: displayId,
      title,
      thumbnail: `http://tv.dfb.de/images/${videoId}_640x360.jpg`,
      upload_date: unified_strdate(timeDate) ?? undefined,
      formats,
    };
  }
}

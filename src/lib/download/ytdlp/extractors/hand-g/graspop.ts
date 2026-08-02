/**
 * GraspopIE — ported from yt-dlp graspop.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj, url_or_none } from '../../utils';

export class GraspopIE extends InfoExtractor {
  static IE_NAME = 'graspop';
  static _VALID_URL = /https?:\/\/vod\.graspop\.be\/[a-z]{2}\/(?<id>\d+)\//;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const metadata = await this._download_json<Record<string, unknown>>(
      `https://tv.proximus.be/MWC/videocenter/festivals/${videoId}/stream`,
      videoId,
    );
    const assetUri = traverse_obj(metadata, ['source', 'assetUri']) as string;
    return {
      id: videoId,
      formats: await this._extract_m3u8_formats(assetUri.replace(/^https:/, 'http:'), videoId, 'mp4'),
      title: traverse_obj(metadata, ['name']) as string | undefined,
      thumbnail: url_or_none(traverse_obj(metadata, ['source', 'poster'])) ?? undefined,
    };
  }
}

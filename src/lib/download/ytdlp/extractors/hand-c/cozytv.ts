/**
 * CozyTVIE — ported from yt-dlp cozytv.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unified_strdate } from '../../utils';

export class CozyTVIE extends InfoExtractor {
  static IE_NAME = 'cozytv';
  static _VALID_URL = /https?:\/\/(?:www\.)?cozy\.tv\/(?<uploader>[^/]+)\/replays\/(?<id>[^/$#&?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const uploader = m.groups!.uploader!;
    const date = m.groups!.id!;
    const videoId = `${uploader}-${date}`;

    const dataJson = await this._download_json<{ title?: string; user?: string; date?: string; duration?: number }>(
      `https://api.cozy.tv/cache/${uploader}/replay/${date}`,
      videoId,
    );

    const formats = await this._extract_m3u8_formats(
      `https://cozycdn.foxtrotstream.xyz/replays/${uploader}/${date}/index.m3u8`,
      videoId,
      'mp4',
    );

    return {
      id: videoId,
      title: dataJson.title,
      uploader: dataJson.user || uploader,
      upload_date: unified_strdate(dataJson.date) || undefined,
      was_live: true,
      duration: dataJson.duration ?? undefined,
      formats,
    };
  }
}

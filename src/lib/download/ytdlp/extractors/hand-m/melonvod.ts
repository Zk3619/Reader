/** MelonVODIE — ported from yt-dlp melonvod.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { urljoin } from './_helpers';

export class MelonVODIE extends InfoExtractor {
  static IE_NAME = 'melonvod';
  static _VALID_URL = /https?:\/\/vod\.melon\.com\/video\/detail2\.html?\?.*?mvId=(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const playInfo = await this._download_json<Record<string, unknown>>(
      'http://vod.melon.com/video/playerInfo.json',
      videoId,
      'Downloading player info JSON',
      { query: { mvId: videoId } },
    );
    const title = String((playInfo.mvInfo as Record<string, unknown> | undefined)?.MVTITLE ?? videoId);

    const info = await this._download_json<{ streamingInfo?: Record<string, unknown>; staticDomain?: string }>(
      'http://vod.melon.com/delivery/streamingInfo.json',
      videoId,
      'Downloading streaming info JSON',
      { query: { contsId: videoId, contsType: 'VIDEO' } },
    );
    const streamInfo = info.streamingInfo || {};

    const formats = await this._extract_m3u8_formats(
      String(streamInfo.encUrl ?? ''),
      videoId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );

    const artistList = playInfo.artistList as unknown[] | undefined;
    let artist: string | undefined;
    if (Array.isArray(artistList)) {
      artist = artistList
        .map((a) => (a as Record<string, unknown>).ARTISTNAMEWEBLIST)
        .filter(Boolean)
        .join(', ');
    }

    const uploadDate = String(streamInfo.mvSvcOpenDt ?? '').slice(0, 8) || undefined;
    return {
      id: videoId,
      title,
      artist,
      thumbnail: urljoin(info.staticDomain || '', String(streamInfo.imgPath ?? '')) || undefined,
      upload_date: uploadDate,
      duration: int_or_none(streamInfo.playTime) ?? undefined,
      formats,
    };
  }
}

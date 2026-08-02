/** MatchiTVIE — ported from yt-dlp matchitv.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, traverse_obj, unified_strdate } from '../../utils';
import { searchNextjsData } from './_helpers';

export class MatchiTVIE extends InfoExtractor {
  static IE_NAME = 'matchitv';
  static _VALID_URL = /https?:\/\/(?:www\.)?matchi\.tv\/watch\/?\?(?:[^#]+&)?s=(?<id>[0-9a-zA-Z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const loadedMedia =
      (traverse_obj(searchNextjsData(this, webpage, videoId), ['pageProps', 'loadedMedia']) as Record<
        string,
        unknown
      >) || {};
    const startDateTime = str_or_none(loadedMedia.startDateTime);

    return {
      id: videoId,
      title: [str_or_none(loadedMedia.courtDescription), startDateTime].filter(Boolean).join(' ') || undefined,
      thumbnail: `https://thumbnails.padelgo.tv/${videoId}.jpg`,
      upload_date: unified_strdate(startDateTime) ?? undefined,
      formats: await this._extract_m3u8_formats(
        `https://streams.padelgo.tv/v2/streams/m3u8/${videoId}/anonymous/playlist.m3u8`,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
      ),
    };
  }
}

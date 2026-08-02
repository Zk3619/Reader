/** ScreencastifyIE — ported from yt-dlp screencastify.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { parse_qs, traverse_obj, update_url_query } from '../../utils';

export class ScreencastifyIE extends InfoExtractor {
  static IE_NAME = 'screencastify';
  static _VALID_URL = [
    /https?:\/\/watch\.screencastify\.com\/v\/(?<id>[^/?#]+)/,
    /https?:\/\/app\.screencastify\.com\/v[23]\/watch\/(?<id>[^/?#]+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const info = await this._download_json<Record<string, unknown>>(
      `https://umbrella.svc.screencastify.com/api/umbrellaService/watch/${videoId}`,
      videoId,
    );

    const manifest = (info.manifest as Record<string, unknown>) || {};
    const auth = (manifest.auth as Record<string, unknown>) || {};
    const queryString = auth.query as string | undefined;
    const query = queryString ? parse_qs(queryString) : {};

    const formats: Format[] = [];
    const dashUrl = traverse_obj(manifest, ['url']) as string | undefined;
    if (dashUrl) {
      formats.push(
        ...(await this._extract_mpd_formats(dashUrl, videoId, 'dash', undefined, false)),
      );
    }
    const hlsUrl = traverse_obj(manifest, ['hlsUrl']) as string | undefined;
    if (hlsUrl) {
      formats.push(
        ...(await this._extract_m3u8_formats(hlsUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }
    for (const f of formats) {
      if (f.url) f.url = update_url_query(f.url, query);
    }

    return {
      id: videoId,
      title: info.title as string | undefined,
      description: info.description as string | undefined,
      uploader: info.userName as string | undefined,
      formats,
      extra_param_to_segment_url: queryString,
    };
  }
}

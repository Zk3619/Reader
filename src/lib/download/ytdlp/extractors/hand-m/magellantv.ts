/** MagellanTVIE — ported from yt-dlp magellantv.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { parse_duration, url_or_none, traverse_obj } from '../../utils';
import { parse_age_limit, searchNextjsData } from './_helpers';

export class MagellanTVIE extends InfoExtractor {
  static IE_NAME = 'magellantv';
  static _VALID_URL = /https?:\/\/(?:www\.)?magellantv\.com\/(?:watch|video)\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const context = traverse_obj(searchNextjsData(this, webpage, videoId), [
      'pageProps',
      'reactContext',
    ]) as Record<string, unknown>;
    const data =
      (traverse_obj(context, ['video', 'detail']) as Record<string, unknown> | undefined) ||
      (traverse_obj(context, ['series', 'currentEpisode']) as Record<string, unknown> | undefined) ||
      {};

    const formats: Format[] = [];
    const m3u8Urls = new Set<string>();
    const manifests = traverse_obj(data, ['manifests']) as Record<string, Record<string, unknown>> | undefined;
    if (manifests && typeof manifests === 'object') {
      for (const entry of Object.values(manifests)) {
        for (const candidate of [entry?.hls, entry?.jwp_video_url]) {
          const m3u8Url = url_or_none(candidate);
          if (!m3u8Url || m3u8Urls.has(m3u8Url)) continue;
          m3u8Urls.add(m3u8Url);
          formats.push(
            ...(await this._extract_m3u8_formats(
              m3u8Url,
              videoId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              'hls',
              undefined,
              false,
            )),
          );
        }
      }
    }

    if (!formats.length) {
      const error = traverse_obj(context, ['errorDetailPage', 'errorMessage']);
      if (typeof error === 'string' && error.includes('available in your country')) {
        this.raise_geo_restricted(error);
      }
      if (typeof error === 'string') {
        this.raise_no_formats(`${this.IE_NAME} said: ${error}`, true);
      }
    }

    return {
      id: videoId,
      formats,
      subtitles: {},
      title: traverse_obj(data, ['title']) as string | undefined,
      description: traverse_obj(data, ['metadata', 'description']) as string | undefined,
      duration: parse_duration(traverse_obj(data, ['duration'])) ?? undefined,
      age_limit: parse_age_limit(String(traverse_obj(data, ['ratingCategory']) ?? '')),
      tags: (traverse_obj(data, ['tags'], { get_all: true }) as string[] | undefined) || undefined,
    };
  }
}

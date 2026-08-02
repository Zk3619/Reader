/** NZOnScreenIE — ported from yt-dlp nzonscreen.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none, traverse_obj } from '../../utils';
import { strip_or_none } from './_helpers';

export class NZOnScreenIE extends InfoExtractor {
  static IE_NAME = 'NZOnScreen';
  static _VALID_URL = /https?:\/\/www\.nzonscreen\.com\/title\/(?<id>[^/?#]+)/;

  protected *_extractFormats(playlist: Record<string, unknown>): Generator<Format> {
    const h264 = (playlist.h264 as Record<string, string>) || {};
    for (const [id, resKey] of [
      ['lo', 'lo_res'],
      ['hi', 'hi_res'],
    ] as const) {
      const u = h264[resKey];
      if (!u) continue;
      yield {
        url: u,
        format_id: id,
        ext: 'mp4',
        quality: id === 'hi' ? 1 : 0,
        height: id === 'hi' ? int_or_none(playlist.height) ?? undefined : undefined,
        width: id === 'hi' ? int_or_none(playlist.width) ?? undefined : undefined,
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const playlist = this._search_json<Record<string, unknown>>(
      /data-video-config='([^']+)'/,
      webpage,
      'media data',
      videoId,
    )!;

    const pageTitle = this._og_search_title(webpage) || '';
    return {
      id: String(playlist.uuid ?? videoId),
      display_id: videoId,
      title: strip_or_none(playlist.label) ?? undefined,
      description: strip_or_none(playlist.description) ?? undefined,
      alt_title: strip_or_none(pageTitle.replace(/ \| NZ On Screen$/, '')) ?? undefined,
      thumbnail: traverse_obj(playlist, ['thumbnail', 'path']) as string | undefined,
      duration: float_or_none(playlist.duration) ?? undefined,
      formats: [...this._extractFormats(playlist)],
      http_headers: { Referer: 'https://www.nzonscreen.com/', Origin: 'https://www.nzonscreen.com/' },
    };
  }
}

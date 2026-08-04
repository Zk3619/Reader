// @ts-nocheck
/** WeVidiIE â€?ported from yt-dlp wevidi.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  float_or_none,
  get_element_by_class,
  int_or_none,
  js_to_json,
} from '../../utils';

const RESOLUTION_MAP: Record<number, number> = {
  1: 144,
  2: 240,
  3: 360,
  4: 480,
  5: 720,
  6: 1080,
};

export class WeVidiIE extends InfoExtractor {
  static IE_NAME = 'WeVidi';
  static _VALID_URL = /https?:\/\/(?:www\.)?wevidi\.net\/watch\/(?<id>[\w-]{11})/;

  protected *_extractFormats(wvplayerProps: Record<string, unknown>): Generator<Format> {
    const srcPath = `${wvplayerProps.srcVID}/${wvplayerProps.srcUID}/${wvplayerProps.srcNAME}`;
    const resolutions = (wvplayerProps.resolutions as unknown[]) || [];
    for (const resRaw of resolutions) {
      const res = typeof resRaw === 'number' ? resRaw : int_or_none(resRaw);
      if (res == null) continue;
      // Python: str(-(res // -2) - 1)  â†?ceil(res/2) - 1
      const formatId = String(Math.ceil(res / 2) - 1);
      yield {
        acodec: 'mp4a.40.2',
        ext: 'mp4',
        format_id: formatId,
        height: RESOLUTION_MAP[res],
        url: `https://www.wevidi.net/videoplayback/${srcPath}/${formatId}`,
        vcodec: 'avc1.42E01E',
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const wvplayerProps = this._search_json<Record<string, unknown>>(
      /WVPlayer\(/,
      webpage,
      'player',
      videoId,
      {
        transform_source: (x) => js_to_json(x.replace(/\|\|/g, '}')),
      },
    )!;

    return {
      id: videoId,
      title: clean_html(get_element_by_class('video_title', webpage)) || videoId,
      description: clean_html(get_element_by_class('descr_long', webpage)) || undefined,
      uploader: clean_html(get_element_by_class('username', webpage)) || undefined,
      formats: [...this._extractFormats(wvplayerProps)],
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      duration: float_or_none(wvplayerProps.duration) ?? undefined,
    };
  }
}

// @ts-nocheck
/** XNXXIE â€?ported from yt-dlp xnxx.py */

import { InfoExtractor, NO_DEFAULT } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, str_to_int } from '../../utils';

export class XNXXIE extends InfoExtractor {
  static IE_NAME = 'XNXX';
  static _VALID_URL = /https?:\/\/(?:video|www)\.xnxx3?\.com\/video-?(?<id>[0-9a-z]+)\//;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const get = (
      meta: string,
      defaultValue: string | typeof NO_DEFAULT | null = NO_DEFAULT,
      fatal = true,
    ): string | null =>
      this._search_regex(
        new RegExp(`set${meta}\\s*\\(\\s*(["'])(?<value>(?:(?!\\1).)+)\\1`),
        webpage,
        meta,
        defaultValue,
        fatal,
        'value',
      );

    const title = this._og_search_title(webpage) || get('VideoTitle') || videoId;

    const formats: Format[] = [];
    for (const mobj of webpage.matchAll(
      /setVideo(?:Url(?<id>Low|High)|HLS)\s*\(\s*(["'])(?<url>(?:https?:)?\/\/.+?)\1/g,
    )) {
      const formatUrl = mobj.groups!.url!;
      if (determine_ext(formatUrl) === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            formatUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            1,
            'hls',
            undefined,
            false,
          )),
        );
      } else {
        let formatId = mobj.groups?.id;
        if (formatId) formatId = formatId.toLowerCase();
        formats.push({
          url: formatUrl,
          format_id: formatId || 'http',
          quality: formatId === 'low' ? -1 : 0,
        });
      }
    }

    const thumbnail =
      this._og_search_thumbnail(webpage) ||
      get('ThumbUrl', null, false) ||
      get('ThumbUrl169', null, false) ||
      undefined;

    const duration = int_or_none(this._og_search_property('duration', webpage)) ?? undefined;
    const viewCount = str_to_int(
      this._search_regex(
        /id=["']nb-views-number[^>]+>([\d,.]+)/,
        webpage,
        'view count',
        null,
        false,
      ),
    );

    return {
      id: videoId,
      title,
      thumbnail: thumbnail || undefined,
      duration,
      view_count: viewCount ?? undefined,
      age_limit: 18,
      formats,
    };
  }
}

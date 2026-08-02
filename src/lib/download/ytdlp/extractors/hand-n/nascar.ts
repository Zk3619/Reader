/**
 * NascarClassicsIE — ported from yt-dlp nascar.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601, searchNextjsData } from './_helpers';

export class NascarClassicsIE extends InfoExtractor {
  static IE_NAME = 'nascarclassics';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?classics\.nascar\.com\/video\/(?<id>[\w~-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const nextData = searchNextjsData(this, webpage, videoId);
    const contentData = traverse_obj(nextData, ['pageProps', 'contentData']) as Record<string, unknown>;
    const input = (contentData.input as Record<string, unknown>) || {};

    const src = url_or_none(input.src);
    const formats = src ? await this._extract_m3u8_formats(src, videoId, 'mp4') : [];

    const timelines = traverse_obj(contentData, ['overlay', 'data', 'timelines', 0, 'events']) as
      | Array<Record<string, unknown>>
      | undefined;
    const chapters = (timelines || [])
      .filter((ev) => float_or_none(ev.timestamp) != null)
      .map((ev) => ({
        start_time: float_or_none(ev.timestamp) ?? undefined,
        title: ev.name != null ? String(ev.name) : undefined,
      }));

    const settings = (input.settings as Record<string, unknown>) || {};
    const tags = Array.isArray(settings.tags) ? settings.tags.map(String) : undefined;

    return {
      id: videoId,
      formats,
      title: input.name != null ? String(input.name) : undefined,
      description: input.description != null ? String(input.description) : undefined,
      thumbnail: url_or_none(input.thumbnail) ?? undefined,
      tags,
      timestamp: parseIso8601(input.start_time) ?? undefined,
      chapters: chapters.length ? chapters : undefined,
    };
  }
}

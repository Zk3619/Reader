/**
 * NewsyIE — ported from yt-dlp newsy.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { js_to_json, merge_dicts } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class NewsyIE extends InfoExtractor {
  static IE_NAME = 'newsy';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?newsy\.com\/stories\/(?<id>[^/?#$&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const dataJson = this._parse_json<{ stream?: string; id?: string; headline?: string; duration?: number; image?: string }>(
      this._html_search_regex(/data-video-player\s?=\s?"({[^"]+})">/, webpage, 'data')!,
      displayId,
      js_to_json,
    )!;
    const ldJson = this._search_json_ld(webpage, displayId, { fatal: false }) || {};

    let formats: VideoInfo['formats'] = [];
    let subtitles: VideoInfo['subtitles'] = {};
    if (dataJson.stream) {
      const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(
        this,
        dataJson.stream,
        displayId,
        'mp4',
      );
      formats = fmts;
      mergeSubtitles(subtitles, subs);
    }

    return merge_dicts(ldJson, {
      id: dataJson.id,
      display_id: displayId,
      title: dataJson.headline,
      duration: dataJson.duration,
      thumbnail: dataJson.image,
      formats,
      subtitles,
    }) as VideoInfo;
  }
}

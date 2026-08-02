/**
 * CJSWIE — ported from yt-dlp cjsw.py
 */

import { InfoExtractor, NO_DEFAULT } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, unescapeHTML } from '../../utils';

export class CJSWIE extends InfoExtractor {
  static IE_NAME = 'cjsw';
  static _VALID_URL = /https?:\/\/(?:www\.)?cjsw\.com\/program\/(?<program>[^/]+)\/episode\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const program = m.groups!.program!;
    const episodeId = m.groups!.id!;
    let audioId = `${program}/${episodeId}`;

    const webpage = await this._download_webpage(url, episodeId);

    const title = unescapeHTML(
      this._search_regex(
        [/<h1[^>]+class=["']episode-header__title["'][^>]*>(?<title>[^<]+)/, /data-audio-title=(["'])(?<title>(?:(?!\1).)+)\1/],
        webpage,
        'title',
        NO_DEFAULT,
        true,
        'title',
      ),
    );

    const audioUrl = this._search_regex(
      /<button[^>]+data-audio-src=(["'])(?<url>(?:(?!\1).)+)\1/,
      webpage,
      'audio url',
      NO_DEFAULT,
      true,
      'url',
    )!;

    audioId = this._search_regex(/\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\.mp3/, audioUrl, 'audio id', audioId)!;

    const formats: Format[] = [{ url: audioUrl, format_id: 'http', ext: determine_ext(audioUrl, 'mp3'), vcodec: 'none' }];

    const description = this._html_search_regex(/<p>(?<description>.+?)<\/p>/, webpage, 'description', null, false);
    const series = this._search_regex(/data-showname=(["'])(?<name>(?:(?!\1).)+)\1/, webpage, 'series', program, false, 'name');

    return {
      id: audioId,
      title,
      description: description || undefined,
      formats,
      series: series || undefined,
      episode_id: episodeId,
    } as VideoInfo;
  }
}

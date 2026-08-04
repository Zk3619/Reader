// @ts-nocheck
/** Varzesh3IE �?ported from yt-dlp varzesh3.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, parse_qs, remove_start } from '../../utils';
import { htmlExtractTitle } from './_helpers';

export class Varzesh3IE extends InfoExtractor {
  static IE_NAME = 'varzesh3';
  static _WORKING = false;
  static _VALID_URL = /https?:\/\/(?:www\.)?video\.varzesh3\.com\/(?:[^/]+\/)+(?<id>[^/]+)\/?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const videoUrl = this._search_regex(/<source[^>]+src="([^"]+)"/, webpage, 'video url')!;
    const title =
      remove_start(htmlExtractTitle(webpage) || '', 'ویدیو ورزش 3 | ') || displayId;

    let description =
      this._html_search_regex(/<div class="matn">([\s\S]+?)<\/div>/, webpage, 'description', null, false) ||
      null;
    if (description == null) {
      description = clean_html(this._html_search_meta('description', webpage) || '');
    }

    let thumbnail = this._og_search_thumbnail(webpage) || undefined;
    if (!thumbnail) {
      const fbSharerUrl = this._search_regex(
        /<a[^>]+href="(https?:\/\/www\.facebook\.com\/sharer\/sharer\.php\?[^"]+)"/,
        webpage,
        'facebook sharer URL',
        null,
        false,
      );
      if (fbSharerUrl) {
        const sharerParams = parse_qs(fbSharerUrl);
        thumbnail = sharerParams['p[images][0]']?.[0] || undefined;
      }
    }

    let videoId =
      this._search_regex(
        /<link[^>]+rel='(?:canonical|shortlink)'[^>]+href='\/\?p=([^']+)'/,
        webpage,
        displayId,
        null,
        false,
      ) || undefined;
    if (!videoId) {
      videoId =
        this._search_regex(/var\s+VideoId\s*=\s*(\d+);/, webpage, 'video id', displayId, false) ||
        displayId;
    }

    return {
      id: videoId,
      url: videoUrl,
      title,
      description: description || undefined,
      thumbnail,
    };
  }
}

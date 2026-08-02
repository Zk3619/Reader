/** ScreencastIE — ported from yt-dlp screencast.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_qs } from '../../utils';

export class ScreencastIE extends InfoExtractor {
  static IE_NAME = 'screencast';
  static _VALID_URL = /https?:\/\/(?:www\.)?screencast\.com\/t\/(?<id>[a-zA-Z0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    let videoUrl = this._html_search_regex(
      /<embed name="Video".*?src="([^"]+)"/,
      webpage,
      'QuickTime embed',
      null,
      false,
    );

    if (!videoUrl) {
      let flashVarsS = this._html_search_regex(
        /<param name="flashVars" value="([^"]+)"/,
        webpage,
        'flash vars',
        null,
        false,
      );
      if (!flashVarsS) {
        flashVarsS = this._html_search_regex(
          /<param name="initParams" value="([^"]+)"/,
          webpage,
          'flash vars',
          null,
          false,
        );
        if (flashVarsS) flashVarsS = flashVarsS.replace(/,/g, '&');
      }
      if (flashVarsS) {
        const flashVars = parse_qs(flashVarsS);
        const content = flashVars.content?.[flashVars.content.length - 1];
        if (content) videoUrl = decodeURIComponent(content).replace(/^http%3A/, 'http:');
      }
    }

    if (!videoUrl) {
      const videoMeta = this._html_search_meta('og:video', webpage, null, false);
      if (videoMeta) {
        videoUrl = this._search_regex(/src=(.*?)(?:$|&)/, videoMeta, 'meta tag video URL', null, false);
      }
    }

    if (!videoUrl) {
      videoUrl =
        this._html_search_regex(
          /MediaContentUrl["']\s*:(["'])(?<url>(?:(?!\1).)+)\1/,
          webpage,
          'video url',
          null,
          false,
          'url',
        );
    }

    if (!videoUrl) videoUrl = this._html_search_meta('og:video', webpage, null, false);
    if (!videoUrl) throw new ExtractorError('Cannot find video', { expected: true });

    let title = this._og_search_title(webpage, false);
    if (!title) {
      title =
        this._html_search_regex(
          [/<b>Title:<\/b> ([^<]+)<\/div>/, /class="tabSeperator">><\/span><span class="tabText">(.+?)</, /<title>([^<]+)<\/title>/],
          webpage,
          'title',
        ) || videoId;
    }

    return {
      id: videoId,
      url: videoUrl,
      title,
      description: this._og_search_description(webpage) || this._html_search_meta('description', webpage) || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
    };
  }
}

/**
 * HotNewHipHopIE — ported from yt-dlp hotnewhiphop.py (_WORKING = False upstream)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { urlencodePostdata } from './_helpers';

export class HotNewHipHopIE extends InfoExtractor {
  static IE_NAME = 'hotnewhiphop';
  static _VALID_URL = /https?:\/\/(?:www\.)?hotnewhiphop\.com\/.*\.(?<id>.*)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const videoUrlBase64 = this._search_regex(/data-path="(.*?)"/, webpage, 'video URL', null, false);

    if (!videoUrlBase64) {
      const contentUrl = this._search_regex(/"contentUrl" content="(.*?)"/, webpage, 'content URL');
      return this.url_result(contentUrl!, 'Youtube');
    }

    const reqdata = urlencodePostdata({ mediaType: 's', mediaId: videoId });
    const mkd = await this._download_json<Record<string, unknown>>(
      'http://www.hotnewhiphop.com/ajax/media/getActions/',
      videoId,
      'Requesting media key',
      {
        data: reqdata,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
    if (!mkd.mediaKey) throw new ExtractorError('Did not get a media key', { expected: true });

    const redirectUrl = atob(videoUrlBase64);
    const resolved = await this._request_webpage(redirectUrl, videoId, 'Resolving final URL');
    const videoUrl = resolved?.url || redirectUrl;
    if (videoUrl.endsWith('.html')) {
      throw new ExtractorError('Redirect failed', { expected: true });
    }

    return {
      id: videoId,
      url: videoUrl,
      title: (this._og_search_title(webpage) ?? videoId).trim(),
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
    };
  }
}

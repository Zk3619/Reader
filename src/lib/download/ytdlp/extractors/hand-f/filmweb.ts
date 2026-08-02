/**
 * FilmwebIE ??ported from yt-dlp filmweb.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

function protoRelativeUrl(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url;
}

export class FilmwebIE extends InfoExtractor {
  static IE_NAME = 'filmweb';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?filmweb\.no\/(?<type>trailere|filmnytt)\/article(?<id>\d+)\.ece/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let articleType = m.groups!.type!;
    let articleId = m.groups!.id!;

    if (articleType === 'filmnytt') {
      const webpage = await this._download_webpage(url, articleId);
      articleId = this._search_regex(/data-videoid="(\d+)"/, webpage, 'article id')!;
    }

    const embed = await this._download_json<{ embedCode?: string }>(
      'https://www.filmweb.no/template_v2/ajax/json_trailerEmbed.jsp',
      articleId,
      undefined,
      { query: { articleId } },
    );
    const iframeUrl = protoRelativeUrl(
      this._search_regex(/<iframe[^>]+src="([^"]+)"/, embed.embedCode || '', 'iframe url')!,
    );

    return {
      _type: 'url_transparent',
      id: articleId,
      url: iframeUrl,
      ie_key: 'TwentyThreeVideo',
    };
  }
}

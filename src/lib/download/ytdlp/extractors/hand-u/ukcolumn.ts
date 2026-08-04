// @ts-nocheck
/** UkColumnIE â€?ported from yt-dlp ukcolumn.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unescapeHTML } from '../../utils';
import { extractYoutubeEmbedUrl, urljoin } from './_helpers';

function extractVimeoUrl(html: string): string | null {
  const patterns = [
    /(?:https?:)?\/\/(?:www\.)?vimeo\.com\/(?:channels\/[\w]+\/|groups\/[\w]+\/videos\/)?(\d+)/i,
    /(?:https?:)?\/\/player\.vimeo\.com\/video\/(\d+)/i,
    /data-vimeo-id=["'](\d+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return `https://player.vimeo.com/video/${m[1]}`;
    if (m?.[0]?.startsWith('http')) return m[0];
  }
  return null;
}

export class UkColumnIE extends InfoExtractor {
  static IE_NAME = 'ukcolumn';
  static _WORKING = false;
  static _VALID_URL =
    /https?:\/\/(?:www\.)?ukcolumn\.org(?:\/index\.php)?\/(?:video|ukcolumn-news)\/(?<id>[-a-z0-9]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const oembedPath = unescapeHTML(
      this._search_regex(
        /<iframe[^>]+src=(["'])(?<url>\/media\/oembed\?url=.+?)\1/,
        webpage,
        'OEmbed URL',
        null,
        true,
        'url',
      ) || '',
    );
    if (!oembedPath) throw new ExtractorError('No embedded video found');
    const oembedUrl = urljoin(url, oembedPath);
    const oembedWebpage = await this._download_webpage(oembedUrl, displayId, 'Downloading OEmbed page');

    let ieKey = 'Youtube';
    let videoUrl = extractYoutubeEmbedUrl(oembedWebpage);
    if (!videoUrl) {
      ieKey = 'Vimeo';
      videoUrl = extractVimeoUrl(oembedWebpage);
    }
    if (!videoUrl) throw new ExtractorError('No embedded video found');

    return {
      _type: 'url_transparent',
      title: this._og_search_title(webpage) || displayId,
      url: videoUrl,
      ie_key: ieKey,
      id: displayId,
    };
  }
}

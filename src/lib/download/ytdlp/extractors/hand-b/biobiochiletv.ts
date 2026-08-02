/**
 * BioBioChileTVIE — aligned with yt-dlp biobiochiletv.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { remove_end } from '../../utils';

export class BioBioChileTVIE extends InfoExtractor {
  static IE_NAME = 'biobiochiletv';
  static _VALID_URL = /https?:\/\/(?:tv|www)\.biobiochile\.cl\/(?:notas|noticias)\/(?:[^/]+\/)+(?<id>[^/]+)\.shtml/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const rudoUrl = this._search_regex(
      /<iframe[^>]+src=(['"])(?<url>(?:https?:)?\/\/rudo\.video\/vod\/[0-9a-zA-Z]+)\1/,
      webpage,
      'embed URL',
      null,
      true,
      'url',
    );
    if (!rudoUrl) throw new ExtractorError('No videos found');

    const title = remove_end(this._og_search_title(webpage), ' - BioBioChile TV') || videoId;
    const thumbnail = this._og_search_thumbnail(webpage) || undefined;
    const uploader = this._html_search_regex(
      /<a[^>]+href=["'](?:https?:\/\/(?:busca|www)\.biobiochile\.cl)?\/(?:lista\/)?(?:author|autor)[^>]+>(.+?)<\/a>/i,
      webpage,
      'uploader',
      null,
      false,
    );

    return {
      _type: 'url_transparent',
      id: videoId,
      url: rudoUrl.startsWith('//') ? `https:${rudoUrl}` : rudoUrl,
      title,
      thumbnail,
      uploader: uploader || undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'biobiochiletv',
      extractor_key: 'BioBioChileTV',
    };
  }
}

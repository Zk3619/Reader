/**
 * Funker530IE ??ported from yt-dlp funker530.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, get_element_by_class } from '../../utils';
import { stripOrNone } from './_helpers';

function extractEmbedUrl(webpage: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = webpage.match(re);
    if (m?.[1]) return m[1].startsWith('//') ? `https:${m[1]}` : m[1];
  }
  return null;
}

export class Funker530IE extends InfoExtractor {
  static IE_NAME = 'funker530';
  static _VALID_URL = /https?:\/\/(?:www\.)?funker530\.com\/video\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    let info: { url: string; ie_key: string } | null = null;
    const rumbleUrl = extractEmbedUrl(webpage, [
      /https?:\/\/(?:www\.)?rumble\.com\/embed\/[^"'\\\s]+/i,
      /src=["']((?:https?:)?\/\/[^"']*rumble\.com\/[^"']+)["']/i,
    ]);
    if (rumbleUrl) {
      info = { url: rumbleUrl, ie_key: 'RumbleEmbed' };
    } else {
      const youtubeUrl = extractEmbedUrl(webpage, [
        /https?:\/\/(?:www\.)?(?:youtube\.com\/embed\/|youtu\.be\/)[^"'\\\s]+/i,
        /src=["']((?:https?:)?\/\/[^"']*(?:youtube\.com|youtu\.be)[^"']+)["']/i,
      ]);
      if (youtubeUrl) info = { url: youtubeUrl, ie_key: 'Youtube' };
    }

    if (!info) throw new ExtractorError('No videos found on webpage', { expected: true });

    const descBlock = get_element_by_class('video-desc-paragraph', webpage);
    const description = stripOrNone(
      descBlock
        ? this._search_regex(
            /([\s\S]+)About the Author/,
            clean_html(descBlock) || '',
            'description',
            null,
            false,
          )
        : null,
    );

    return {
      ...info,
      _type: 'url_transparent',
      id: displayId,
      description: description ?? undefined,
    };
  }
}

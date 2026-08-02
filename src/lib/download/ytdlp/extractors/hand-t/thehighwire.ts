/**
 * TheHighWireIE — ported from yt-dlp thehighwire.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, extract_attributes, url_or_none } from '../../utils';
import { parseHtml5MediaEntries } from './_helpers';

function getElementHtmlByClass(cls: string, html: string): string | null {
  const re = new RegExp(
    `<([a-zA-Z0-9-]+)([^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>`,
    'i',
  );
  const m = html.match(re);
  return m ? `<${m[1]}${m[2]}>` : null;
}

export class TheHighWireIE extends InfoExtractor {
  static IE_NAME = 'thehighwire';
  static _VALID_URL = /https?:\/\/(?:www\.)?thehighwire\.com\/ark-videos\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const embedEl = getElementHtmlByClass('ark-video-embed', webpage);
    const embedUrl = url_or_none(extract_attributes(embedEl || '')['src']);
    if (!embedUrl) throw new ExtractorError('Unable to extract embed URL', { expected: true });

    const embedPage = await this._download_webpage(embedUrl, displayId);
    const mediaEntries = await parseHtml5MediaEntries(this, embedUrl, embedPage, displayId, {
      m3u8Id: 'hls',
    });
    const media = mediaEntries[0] || {};

    const sectionHeader = getElementHtmlByClass('section-header', webpage);
    const episodeDesc = getElementHtmlByClass('episode-description__copy', webpage);

    return {
      id: displayId,
      title: clean_html(sectionHeader || undefined) || undefined,
      description: clean_html(episodeDesc || undefined) || undefined,
      ...media,
    };
  }
}

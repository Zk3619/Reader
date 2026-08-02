/**
 * AeonCoIE — aligned with yt-dlp aeonco.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { smuggle_url, url_or_none } from '../../utils';

function* yieldJsonLd(html: string): Generator<Record<string, unknown>> {
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>\s*([\s\S]*?)\s*<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]!);
      if (Array.isArray(parsed)) yield* parsed;
      else if (parsed && typeof parsed === 'object') {
        const graph = (parsed as { '@graph'?: unknown })['@graph'];
        if (Array.isArray(graph)) yield* graph;
        else yield parsed as Record<string, unknown>;
      }
    } catch {
      /* skip */
    }
  }
}

export class AeonCoIE extends InfoExtractor {
  static IE_NAME = 'aeonco';
  static _VALID_URL = /https?:\/\/(?:www\.)?aeon\.co\/videos\/(?<id>[^/?]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    let embedUrl: string | null = null;
    for (const item of yieldJsonLd(webpage)) {
      if (item['@type'] !== 'VideoObject') continue;
      embedUrl = url_or_none(item.embedUrl);
      if (embedUrl) break;
    }

    if (!embedUrl) {
      throw new ExtractorError('No embed URL found in webpage', { expected: true });
    }

    if (embedUrl.includes('player.vimeo.com')) {
      embedUrl = smuggle_url(embedUrl, { referer: 'https://aeon.co/' });
    }

    return this.url_result(embedUrl);
  }
}

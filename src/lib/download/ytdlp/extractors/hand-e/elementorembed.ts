/**
 * ElementorEmbedIE — ported from yt-dlp elementorembed.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj, unescapeHTML, url_or_none } from '../../utils';

const WIDGET_REGEX =
  /<div[^>]+class="[^"]*elementor-widget-video(?:-playlist)?[^"]*"[^>]*data-settings="([^"]*)"/g;

export class ElementorEmbedIE extends InfoExtractor {
  static IE_NAME = 'elementorembed';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ElementorEmbedIE is not a standalone extractor', { expected: true });
  }

  static extractFromWebpage(ie: ElementorEmbedIE, _url: string, webpage: string): VideoInfo[] {
    const results: VideoInfo[] = [];
    for (const m of webpage.matchAll(WIDGET_REGEX)) {
      const dataSettings = m[1];
      if (!dataSettings) continue;
      const data = ie._parse_json<Record<string, unknown>>(
        dataSettings,
        undefined,
        unescapeHTML,
        false,
      );
      if (!data) continue;

      const youtubeUrl = url_or_none(traverse_obj(data, ['youtube_url']));
      if (youtubeUrl) results.push(ie.url_result(youtubeUrl, 'Youtube'));

      const tabs = Array.isArray(data.tabs) ? (data.tabs as Record<string, unknown>[]) : [];
      for (const video of tabs) {
        if (!video?._id) continue;
        const yt = url_or_none(traverse_obj(video, ['youtube_url']));
        if (yt) results.push(ie.url_result(yt, 'Youtube'));
        const vimeo = url_or_none(traverse_obj(video, ['vimeo_url']));
        if (vimeo) results.push(ie.url_result(vimeo, 'Vimeo'));
        for (const key of ['hosted_url', 'external_url'] as const) {
          const directUrl = url_or_none(traverse_obj(video, [key, 'url']));
          if (directUrl) {
            results.push({
              id: String(video._id),
              url: directUrl,
              title: (video.title as string) || String(video._id),
            });
          }
        }
      }
    }
    return results;
  }
}

/**
 * BTVPlusIE — aligned with yt-dlp btvplus.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, get_element_by_class, js_to_json, mimetype2ext, str_or_none, url_or_none } from '../../utils';
import { urljoin } from './_helpers';

export class BTVPlusIE extends InfoExtractor {
  static IE_NAME = 'btvplus';
  static _VALID_URL = /https?:\/\/(?:www\.)?btvplus\.bg\/produkt\/(?:predavaniya|seriali|novini)\/(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const playerUrl = this._search_regex(/var\s+videoUrl\s*=\s*['"]([^'"]+)['"]/, webpage, 'player URL')!;

    const playerConfig = (
      await this._download_json<Record<string, unknown>>(urljoin('https://btvplus.bg', playerUrl), videoId)
    ).config as string;

    const videojsData = this._search_json<Record<string, unknown>>(
      /videojs\(["'][^"']+["'],/,
      playerConfig,
      'videojs data',
      videoId,
      { transform_source: js_to_json },
    )!;

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const src of (videojsData.sources as Record<string, unknown>[]) || []) {
      const srcUrl = url_or_none(src.src);
      if (!srcUrl) continue;
      const ext = mimetype2ext(src.type as string);
      if (ext === 'm3u8') {
        const fmts = await this._extract_m3u8_formats(
          srcUrl,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        );
        formats.push(...fmts);
      } else {
        this.report_warning(`Unknown format type ${ext}`);
      }
    }

    return {
      id: videoId,
      formats,
      subtitles,
      title:
        str_or_none(this._og_search_title(webpage)) ||
        clean_html(get_element_by_class('product-title', webpage)) ||
        videoId,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      description: this._og_search_description(webpage),
      webpage_url: url,
      original_url: url,
      extractor: 'btvplus',
      extractor_key: 'BTVPlus',
    };
  }
}

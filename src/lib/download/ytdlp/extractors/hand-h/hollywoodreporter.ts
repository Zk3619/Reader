/**
 * HollywoodReporterIE / HollywoodReporterPlaylistIE — ported from yt-dlp hollywoodreporter.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes, get_element_by_class } from '../../utils';

function getElementHtmlByClass(cls: string, html: string): string | null {
  const re = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>`,
    'i',
  );
  const m = html.match(re);
  return m ? `<${m[1]}${m[2]}>` : null;
}

export class HollywoodReporterIE extends InfoExtractor {
  static IE_NAME = 'hollywoodreporter';
  static _VALID_URL = /https?:\/\/(?:www\.)?hollywoodreporter\.com\/video\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const data = extract_attributes(getElementHtmlByClass('vlanding-video-card__link', webpage) || '');
    const videoId = data['data-video-showcase-trigger'];
    const showcaseType = data['data-video-showcase-type'];

    if (showcaseType === 'jwplayer') {
      return this.url_result(`jwplatform:${videoId}`, 'JWPlatform', videoId);
    }
    if (showcaseType === 'youtube') {
      return this.url_result(videoId, 'Youtube', videoId);
    }
    throw new ExtractorError(`Unsupported showcase type "${showcaseType}"`, { expected: true });
  }
}

export class HollywoodReporterPlaylistIE extends InfoExtractor {
  static IE_NAME = 'hollywoodreporterplaylist';
  static _VALID_URL = /https?:\/\/(?:www\.)?hollywoodreporter\.com\/vcategory\/(?<slug>[\w-]+)-(?<id>\d+)/;
  static _PAGE_SIZE = 15;

  protected async *_fetchPage(slug: string, plId: string, page: number): AsyncGenerator<VideoInfo> {
    const pageNum = page + 1;
    const webpage = await this._download_webpage(
      `https://www.hollywoodreporter.com/vcategory/${slug}-${plId}/page/${pageNum}/`,
      plId,
      `Downloading playlist page ${pageNum}`,
    );
    const section = get_element_by_class('video-playlist-river', webpage) || '';
    for (const m of section.matchAll(/<a[^>]+href="([^"]+)"[^>]+class="c-title__link/gi)) {
      yield this.url_result(m[1]!, 'HollywoodReporter');
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const slug = m.groups!.slug!;
    const plId = m.groups!.id!;

    const entries: VideoInfo[] = [];
    for (let page = 0; page < 100; page++) {
      let count = 0;
      for await (const entry of this._fetchPage(slug, plId, page)) {
        entries.push(entry);
        count++;
      }
      if (count < HollywoodReporterPlaylistIE._PAGE_SIZE) break;
    }

    return this.playlist_result(entries, plId, slug);
  }
}

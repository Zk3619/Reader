/**
 * AltCensoredIE / AltCensoredChannelIE — aligned with yt-dlp altcensored.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, str_to_int } from '../../utils';

function urlJoin(base: string, path: string): string {
  try {
    return new URL(path, base).href;
  } catch {
    return path;
  }
}

function orderedSet<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export class AltCensoredIE extends InfoExtractor {
  static IE_NAME = 'altcensored';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?altcensored\.com\/(?:watch\?v=|embed\/)(?<id>[^/?#]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const category = clean_html(
      this._html_search_regex(
        /<a href="\/category\/\d+">([^<]+)<\/a>/,
        webpage,
        'category',
        null,
        false,
      ),
    );

    return {
      _type: 'url_transparent',
      id: videoId,
      url: `https://archive.org/details/youtube-${videoId}`,
      ie_key: 'ArchiveOrg',
      view_count: str_to_int(
        this._html_search_regex(
          /YouTube Views:(?:\s|&nbsp;)*([\d,]+)/,
          webpage,
          'view count',
          null,
          false,
        ),
      ),
      categories: category ? [category] : undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'altcensored',
      extractor_key: 'AltCensored',
    };
  }
}

export class AltCensoredChannelIE extends InfoExtractor {
  static IE_NAME = 'altcensored:channel';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?altcensored\.com\/channel\/(?!page|table)(?<id>[^/?#]+)/i;
  static _PAGE_SIZE = 24;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const webpage = await this._download_webpage(
      url,
      channelId,
      'Download channel webpage',
    );
    const title = this._html_search_meta('altcen_title', webpage, 'title', false);
    const pageCount =
      int_or_none(
        this._html_search_regex(
          /<a[^>]+href="\/channel\/[\w-]+\/page\/(\d+)">(?:\1)<\/a>/,
          webpage,
          'page count',
          '1',
          false,
        ),
      ) || 1;

    const entries: VideoInfo[] = [];
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const pageWebpage = await this._download_webpage(
        `https://altcensored.com/channel/${channelId}/page/${pageNum}`,
        channelId,
        `Downloading page ${pageNum}`,
      );
      const items = orderedSet(
        [...pageWebpage.matchAll(/<a[^>]+href="(\/watch\?v=[^"]+)"/g)].map((m) => m[1]!),
      );
      for (const path of items) {
        entries.push(
          this.url_result(
            urlJoin('https://www.altcensored.com', path),
            'AltCensored',
          ),
        );
      }
    }

    return this.playlist_result(entries, channelId, title || undefined);
  }
}

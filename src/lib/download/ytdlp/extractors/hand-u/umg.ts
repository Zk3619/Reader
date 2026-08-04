// @ts-nocheck
/** UMGDeIE â€?ported from yt-dlp umg.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html } from '../../utils';

export class UMGDeIE extends InfoExtractor {
  static IE_NAME = 'umg:de';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?universal-music\.de\/[^/?#]+\/videos\/(?<slug>[^/?#]+-(?<id>\d+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups?.slug || '';
    const videoId = m.groups?.id || '';
    const webpage = await this._download_webpage(url, displayId);

    const jsonLd = this._search_json_ld(webpage, displayId, { fatal: false }) || {};
    const artistMeta = this._html_search_meta('umg-artist-screenname', webpage);
    const artists = artistMeta ? [artistMeta].filter(Boolean) : undefined;

    const descMatch = webpage.match(/class=["'][^"']*_3Y0Lj[^"']*["'][^>]*>([\s\S]*?)<\//i);
    const description = descMatch?.[1] ? clean_html(descMatch[1]) : undefined;

    const formats = await this._extract_m3u8_formats(
      `https://hls.universal-music.de/get?id=${encodeURIComponent(videoId)}`,
      displayId,
      'mp4',
    );

    return {
      ...jsonLd,
      id: videoId,
      artists,
      description: description || undefined,
      display_id: displayId,
      formats,
    } as VideoInfo;
  }
}

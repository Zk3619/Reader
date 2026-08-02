/**
 * GameSpotIE — ported from yt-dlp gamespot.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';

export class GameSpotIE extends InfoExtractor {
  static IE_NAME = 'gamespot';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?gamespot\.com\/(?:video|article|review)s\/(?:[^/]+\/\d+-|embed\/)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._match_id(url);
    const webpage = await this._download_webpage(url, pageId);
    const dataVideo = this._parse_json<Record<string, unknown>>(
      this._html_search_regex(/data-video=(["'])({.*?})\1/, webpage, 'video data', null, true, 2)!,
      pageId,
    )!;
    const title = decodeURIComponent(String(dataVideo.title ?? ''));
    const streams = (dataVideo.videoStreams as Record<string, string>) || {};
    const formats: Format[] = [];

    const m3u8Url = streams.adaptive_stream;
    if (m3u8Url) {
      const m3u8Formats = await this._extract_m3u8_formats(
        m3u8Url,
        pageId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      );
      for (const f of m3u8Formats) {
        formats.push(f);
        const httpF = { ...f };
        delete httpF.manifest_url;
        formats.push({
          ...httpF,
          format_id: String(f.format_id || 'hls').replace('hls-', 'http-'),
          protocol: 'http',
          url: String(f.url).replace('.m3u8', '.mp4'),
        });
      }
    }

    const mpdUrl = streams.adaptive_dash;
    if (mpdUrl) {
      formats.push(...(await this._extract_mpd_formats(mpdUrl, pageId, 'dash', undefined, false)));
    }

    return {
      id: String(dataVideo.guid ?? pageId),
      display_id: pageId,
      title,
      formats,
      description: this._html_search_meta('description', webpage) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
    };
  }
}

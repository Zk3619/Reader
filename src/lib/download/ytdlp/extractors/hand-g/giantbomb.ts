/**
 * GiantBombIE — ported from yt-dlp giantbomb.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, unescapeHTML } from '../../utils';

const QUALITY_ORDER = ['f4m_low', 'progressive_low', 'f4m_high', 'progressive_high', 'f4m_hd', 'progressive_hd'];

function qualityRank(formatId: string): number {
  const idx = QUALITY_ORDER.indexOf(formatId);
  return idx >= 0 ? QUALITY_ORDER.length - idx : 0;
}

export class GiantBombIE extends InfoExtractor {
  static IE_NAME = 'giantbomb';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?giantbomb\.com\/(?:videos|shows)\/(?<display_id>[^/]+)\/(?<id>\d+-\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.display_id!;
    const webpage = await this._download_webpage(url, displayId);

    const title = this._og_search_title(webpage) ?? undefined;
    const description = this._og_search_description(webpage) ?? undefined;
    const thumbnail = this._og_search_thumbnail(webpage) ?? undefined;

    const video = JSON.parse(
      unescapeHTML(this._search_regex(/data-video="([^"]+)"/, webpage, 'data-video')!),
    ) as Record<string, unknown>;
    const duration = int_or_none(video.lengthSeconds) ?? undefined;
    const videoStreams = (video.videoStreams as Record<string, string>) || {};
    const formats: Format[] = [];

    for (const [formatId, videoUrl] of Object.entries(videoStreams)) {
      if (formatId === 'f4m_stream') continue;
      const ext = determine_ext(videoUrl);
      if (ext === 'f4m') {
        const f4mFormats = await this._extract_mpd_formats(`${videoUrl}?hdcore=3.3.1`, displayId);
        if (f4mFormats[0]) f4mFormats[0].quality = qualityRank(formatId);
        formats.push(...f4mFormats);
      } else if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            videoUrl,
            displayId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          )),
        );
      } else {
        formats.push({ url: videoUrl, format_id: formatId, quality: qualityRank(formatId) });
      }
    }

    if (!formats.length && video.youtubeID) {
      return this.url_result(String(video.youtubeID), 'Youtube');
    }

    return { id: videoId, display_id: displayId, title, description, thumbnail, duration, formats };
  }
}

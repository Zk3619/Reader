/**
 * BildIE — aligned with yt-dlp bild.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, unescapeHTML } from '../../utils';

export class BildIE extends InfoExtractor {
  static IE_NAME = 'Bild.de';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bild\.de\/(?:[^/]+\/)+(?<display_id>[^/]+)-(?<id>\d+)(?:,auto=true)?\.bild\.html/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const videoData = await this._download_json<Record<string, unknown>>(
      `${url.split('.bild.html')[0]},view=json.bild.html`,
      videoId,
    );

    const formats: Format[] = [];
    const clipList = (videoData.clipList as Record<string, unknown>[]) || [];
    const srces = (clipList[0]?.srces as Record<string, unknown>[]) || [];
    for (const src of srces) {
      if (!src?.src) continue;
      const srcType = src.type;
      if (srcType === 'application/x-mpegURL') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            String(src.src),
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          )),
        );
      } else if (srcType === 'video/mp4') {
        formats.push({ url: String(src.src), format_id: 'http-mp4' });
      } else {
        this.report_warning(`Skipping unsupported format type: "${srcType}"`);
      }
    }

    return {
      id: videoId,
      title: (unescapeHTML(String(videoData.title ?? '')) || '').trim(),
      description: unescapeHTML(videoData.description as string | undefined) || null,
      formats,
      thumbnail: videoData.poster ? String(videoData.poster) : undefined,
      duration: int_or_none(videoData.durationSec) ?? undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'Bild.de',
      extractor_key: 'Bild',
    };
  }
}

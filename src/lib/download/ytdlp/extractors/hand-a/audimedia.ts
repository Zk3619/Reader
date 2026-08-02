/**
 * AudiMediaIE — aligned with yt-dlp audimedia.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { parseIso8601 } from './helpers';

export class AudiMediaIE extends InfoExtractor {
  static IE_NAME = 'audimedia';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?audi-mediacenter\.com\/(?:en|de)\/audimediatv\/(?:video\/)?(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const rawPayload = this._search_regex(
      [
        /class="amtv-embed"[^>]+id="([0-9a-z-]+)"/,
        /id="([0-9a-z-]+)"[^>]+class="amtv-embed"/,
        /class=\\"amtv-embed\\"[^>]+id=\\"([0-9a-z-]+)\\"/,
        /id=\\"([0-9a-z-]+)\\"[^>]+class=\\"amtv-embed\\"/,
        /id=(?:\\)?"(amtve-[a-z]-\d+-[a-z]{2})"/,
      ],
      webpage,
      'raw payload',
    );
    if (!rawPayload) throw new ExtractorError('Unable to extract raw payload', { expected: true });
    const parts = rawPayload.split('-');
    const stageMode = parts[1];
    const videoId = parts[2];

    if (stageMode === 's' || stageMode === 'e') {
      throw new ExtractorError('Live stream stage modes not yet supported', { expected: true });
    }

    const videoData = await this._download_json<{ results?: Record<string, unknown> }>(
      `https://www.audimedia.tv/api/video/v1/videos/${videoId}?embed[]=video_versions&embed[]=thumbnail_image`,
      videoId,
    );
    const results = videoData.results || {};
    const formats: Format[] = [];

    const hls = results.stream_url_hls != null ? String(results.stream_url_hls) : '';
    if (hls) {
      formats.push(
        ...(await this._extract_m3u8_formats(hls, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }

    for (const version of (results.video_versions as Record<string, unknown>[]) || []) {
      const versionUrl = String(version.download_url || version.stream_url || '');
      if (!versionUrl) continue;
      const bitrate = versionUrl.match(/(\d+)k/)?.[1];
      formats.push({
        url: versionUrl,
        format_id: bitrate ? `http-${bitrate}` : 'http',
        width: int_or_none(version.width) ?? undefined,
        height: int_or_none(version.height) ?? undefined,
        abr: int_or_none(version.audio_bitrate) ?? undefined,
        vbr: int_or_none(version.video_bitrate) ?? undefined,
      });
    }

    const thumbObj = results.thumbnail_image as Record<string, unknown> | undefined;
    return {
      id: videoId,
      title: String(results.title || videoId),
      description: results.subtitle != null ? String(results.subtitle) : null,
      thumbnail: thumbObj?.file != null ? String(thumbObj.file) : undefined,
      timestamp: parseIso8601(results.publication_date) ?? undefined,
      duration: int_or_none(results.duration) ?? undefined,
      view_count: int_or_none(results.view_count) ?? undefined,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'audimedia',
      extractor_key: 'AudiMedia',
    };
  }
}

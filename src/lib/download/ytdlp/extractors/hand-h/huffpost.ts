/**
 * HuffPostIE — ported from yt-dlp huffpost.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { determine_ext, parse_duration, unified_strdate } from '../../utils';

export class HuffPostIE extends InfoExtractor {
  static IE_NAME = 'huffpost';
  static IE_DESC = 'Huffington Post';
  static _VALID_URL =
    /https?:\/\/(?:embed\.)?live\.huffingtonpost\.com\/(?:r\/segment\/[^/]+\/|HPLEmbedPlayer\/\?segmentId=)(?<id>[0-9a-f]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = (await this._download_json<{ data?: Record<string, unknown> }>(
      `http://embed.live.huffingtonpost.com/api/segments/${videoId}.json`,
      videoId,
    )).data!;

    const videoTitle = String(data.title ?? videoId);
    const duration = parse_duration(data.running_time) ?? undefined;
    const schedule = (data.schedule as Record<string, unknown>) || {};
    const uploadDate =
      unified_strdate(schedule.starts_at ?? data.segment_start_date_time) ?? undefined;
    const description = (data.description as string | undefined) ?? undefined;

    const thumbnails: Thumbnail[] = [];
    const images = (data.images as Record<string, string | null>) || {};
    for (const imgUrl of Object.values(images)) {
      if (!imgUrl) continue;
      const m = imgUrl.match(/.*-([0-9]+x[0-9]+)\./);
      thumbnails.push({ url: imgUrl, resolution: m?.[1] });
    }

    const formats: Format[] = [];
    const sources = (data.sources as Record<string, Record<string, string>>) || {};
    const liveSources = [
      ...Object.entries(sources.live || {}),
      ...Object.entries(sources.live_again || {}),
    ];
    for (const [key, srcUrl] of liveSources) {
      const ext = determine_ext(srcUrl);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(srcUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else {
        formats.push({
          format: key,
          format_id: key.replace('/', '.'),
          ext: 'mp4',
          url: srcUrl,
          vcodec: key.startsWith('audio/') ? 'none' : undefined,
        });
      }
    }

    return {
      id: videoId,
      title: videoTitle,
      description,
      formats,
      duration,
      upload_date: uploadDate,
      thumbnails,
    };
  }
}

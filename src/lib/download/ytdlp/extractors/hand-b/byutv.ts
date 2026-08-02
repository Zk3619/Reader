/**
 * BYUtvIE — aligned with yt-dlp byutv.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext, parse_duration, url_or_none } from '../../utils';

export class BYUtvIE extends InfoExtractor {
  static IE_NAME = 'byutv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?byutv\.org\/(?:watch|player)\/(?!event\/)(?<id>[0-9a-f-]+)(?:\/(?<display_id>[^/?#&]+))?/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? m[1] ?? '';
    const displayId = m.groups?.display_id ?? videoId;

    const video = await this._download_json<Record<string, Record<string, unknown>>>(
      'https://api.byutv.org/api3/catalog/getvideosforcontent',
      displayId,
      undefined,
      {
        query: { contentid: videoId, channel: 'byutv', 'x-byutv-context': 'web$US' },
        headers: { 'x-byutv-context': 'web$US', 'x-byutv-platformkey': 'xsaaw9c7y5' },
      },
    );

    let title: string | undefined;
    let description: string | undefined;
    let thumbnail: string | undefined;
    let duration: number | undefined;
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    for (const [formatId, ep] of Object.entries(video)) {
      if (!ep || typeof ep !== 'object') continue;
      const videoUrl = url_or_none(ep.videoUrl);
      if (!videoUrl) continue;
      const ext = determine_ext(videoUrl);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            videoUrl,
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
      } else if (ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(videoUrl, videoId, 'dash', undefined, false)));
      } else {
        formats.push({ url: videoUrl, format_id: formatId });
      }
      title = (ep.title as string) || title;
      description = (ep.description as string) || description;
      thumbnail = (ep.imageThumbnail as string) || thumbnail;
      duration = parse_duration(ep.length) ?? duration;
    }

    return {
      id: videoId,
      display_id: displayId,
      title: title || displayId,
      description,
      thumbnail,
      duration,
      formats,
      subtitles,
      webpage_url: url,
      original_url: url,
      extractor: 'byutv',
      extractor_key: 'BYUtv',
    };
  }
}

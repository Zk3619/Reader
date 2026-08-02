/**
 * DVTVIE — ported from yt-dlp dvtv.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  join_nonempty,
  js_to_json,
  mimetype2ext,
} from '../../utils';
import { parseIso8601 } from './_helpers';

export class DVTVIE extends InfoExtractor {
  static IE_NAME = 'dvtv';
  static IE_DESC = 'http://video.aktualne.cz/';
  static _VALID_URL = /https?:\/\/video\.aktualne\.cz\/(?:[^/]+\/)+r~(?<id>[0-9a-f]{32})/;

  private async _parseVideoMetadata(
    js: string,
    videoId: string,
    timestamp: number | null,
  ): Promise<VideoInfo> {
    const data = this._parse_json<Record<string, unknown>>(js, videoId, js_to_json)!;
    const title = String(data.title ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const liveStarter = (data.plugins as Record<string, unknown>)?.liveStarter;
    if (liveStarter && typeof liveStarter === 'object') Object.assign(data, liveStarter);

    const formats: Format[] = [];
    const tracks = (data.tracks as Record<string, unknown[]>) || {};
    for (const trackList of Object.values(tracks)) {
      if (!Array.isArray(trackList)) continue;
      for (const video of trackList) {
        if (!video || typeof video !== 'object') continue;
        const v = video as Record<string, unknown>;
        const videoUrl = v.src as string | undefined;
        if (!videoUrl) continue;
        const videoType = v.type as string | undefined;
        const ext = determine_ext(videoUrl, mimetype2ext(videoType) || undefined);
        if (videoType === 'application/vnd.apple.mpegurl' || ext === 'm3u8') {
          formats.push(
            ...(await this._extract_m3u8_formats(videoUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
          );
        } else if (videoType === 'application/dash+xml' || ext === 'mpd') {
          formats.push(...(await this._extract_mpd_formats(videoUrl, videoId, 'dash', undefined, false)));
        } else {
          const label = v.label as string | undefined;
          const heightMatch = label ? /^(\d+)[pP]/.exec(label) : null;
          formats.push({
            url: videoUrl,
            format_id: join_nonempty('http', ext, label),
            height: int_or_none(heightMatch?.[1]) ?? undefined,
          });
        }
      }
    }

    return {
      id: String(data.mediaid ?? videoId),
      title,
      description: (data.description as string) ?? undefined,
      thumbnail: (data.image as string) ?? undefined,
      duration: int_or_none(data.duration) ?? undefined,
      timestamp: timestamp ?? undefined,
      formats,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const timestamp =
      parseIso8601(this._html_search_meta('article:published_time', webpage, undefined, false) || '') ?? null;

    const items = [...webpage.matchAll(/playlist\.push\(({.+?})\);/gs)].map((m) => m[1]!);
    if (items.length) {
      const entries: VideoInfo[] = [];
      for (const item of items) {
        entries.push(await this._parseVideoMetadata(item, videoId, timestamp));
      }
      return this.playlist_result(
        entries,
        videoId,
        this._html_search_meta('twitter:title', webpage) ?? undefined,
      );
    }

    const item = this._search_regex(/BBXPlayer\.setup\((.+?)\);/s, webpage, 'video', null, false);
    if (item) {
      const cleaned = item.replace(/\w+?\((.+)\)/g, '$1');
      return this._parseVideoMetadata(cleaned, videoId, timestamp);
    }

    throw new ExtractorError('Could not find neither video nor playlist');
  }
}

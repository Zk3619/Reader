/**
 * NHLBaseIE / NHLIE — ported from yt-dlp nhl.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { determine_ext, int_or_none, join_nonempty } from '../../utils';
import { parseIso8601 } from './_helpers';
import { parse_duration } from '../../utils';

export class NHLBaseIE extends InfoExtractor {
  static IE_NAME = 'nhlbase';
  static _VALID_URL: RegExp | string | false | null = false;
  protected _CONTENT_DOMAIN = 'nhl.bamcontent.com';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const site = m.groups?.site ?? '';
    const tmpId = m.groups?.id ?? '';
    const videoData = await this._download_json<Record<string, unknown>>(
      `https://${this._CONTENT_DOMAIN}/${site.slice(0, 3)}/${site === 'mlb' ? 'item/' : ''}id/v1/${tmpId}/details/web-v1.json`,
      tmpId,
    );

    let data = videoData;
    if (data.type !== 'video') {
      data = (data.media as Record<string, unknown>) || data;
      data = (data.video as Record<string, unknown>) || ((data.videos as Array<Record<string, unknown>>) || [])[0] || data;
    }

    const videoId = String(data.id ?? tmpId);
    const title = String(data.title ?? videoId);
    const formats: Format[] = [];

    for (const playback of (data.playbacks as Array<Record<string, unknown>>) || []) {
      const playbackUrl = playback.url as string | undefined;
      if (!playbackUrl) continue;
      const ext = determine_ext(playbackUrl);
      if (ext === 'm3u8') {
        const m3u8Formats = await this._extract_m3u8_formats(
          playbackUrl,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          (playback.name as string) || 'hls',
          undefined,
          false,
        );
        formats.push(...m3u8Formats);
      } else {
        const height = int_or_none(playback.height);
        formats.push({
          format_id: (playback.name as string) || join_nonempty('http', height ? `${height}p` : null) || 'http',
          url: playbackUrl,
          width: int_or_none(playback.width) ?? undefined,
          height: height ?? undefined,
          tbr: int_or_none(this._search_regex(/_(\d+)[kK]/, playbackUrl, 'bitrate', undefined, false)) ?? undefined,
        });
      }
    }

    const cutsRaw = (data.image as Record<string, unknown>)?.cuts;
    const cuts = Array.isArray(cutsRaw) ? cutsRaw : cutsRaw && typeof cutsRaw === 'object' ? Object.values(cutsRaw) : [];
    const thumbnails: Thumbnail[] = [];
    for (const thumbnailData of cuts as Array<Record<string, unknown>>) {
      const thumbnailUrl = thumbnailData.src as string | undefined;
      if (!thumbnailUrl) continue;
      thumbnails.push({
        url: thumbnailUrl,
        width: int_or_none(thumbnailData.width) ?? undefined,
        height: int_or_none(thumbnailData.height) ?? undefined,
      });
    }

    return {
      id: videoId,
      title,
      description: data.description as string | undefined,
      timestamp: parseIso8601(data.date) ?? undefined,
      duration: parse_duration(data.duration as string | undefined) ?? undefined,
      thumbnails,
      formats,
    };
  }
}

export class NHLIE extends NHLBaseIE {
  static IE_NAME = 'nhl.com';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<site>nhl|wch2016)\.com\/(?:[^/]+\/)*c-(?<id>\d+)/;
}

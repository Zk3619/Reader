// @ts-nocheck
/**
 * ViqeoIE â€?ported from yt-dlp viqeo.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, str_or_none, url_or_none } from '../../utils';

export class ViqeoIE extends InfoExtractor {
  static IE_NAME = 'viqeo';
  static _WORKING = false;
  static _VALID_URL =
    /(?:viqeo:|https?:\/\/cdn\.viqeo\.tv\/embed\/?\?.*?\bvid=|https?:\/\/api\.viqeo\.tv\/v\d+\/data\/startup?\?.*?\bvideo(?:%5B%5D|\[\])=)(?<id>[\da-f]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(
      `https://cdn.viqeo.tv/embed/?vid=${videoId}`,
      videoId,
    );
    const raw = this._search_regex(/SLOT_DATA\s*=\s*(\{.+?\})\s*;/s, webpage, 'slot data')!;
    const data = this._parse_json<Record<string, unknown>>(raw, videoId) || {};

    const formats: Format[] = [];
    const thumbnails: Thumbnail[] = [];
    for (const mediaFile of (data.mediaFiles as Array<Record<string, unknown>>) || []) {
      if (!mediaFile || typeof mediaFile !== 'object') continue;
      const mediaUrl = url_or_none(mediaFile.url);
      if (!mediaUrl || (!/^https?:\/\//i.test(mediaUrl) && !mediaUrl.startsWith('//'))) continue;
      const mediaType = str_or_none(mediaFile.type);
      if (!mediaType) continue;
      const mediaKind = mediaType.split('/')[0]!.toLowerCase();
      const formatId = str_or_none(mediaFile.quality);
      const f: Format & { id?: string } = {
        url: mediaUrl,
        width: int_or_none(mediaFile.width) ?? undefined,
        height: int_or_none(mediaFile.height) ?? undefined,
      };
      if (mediaKind === 'image') {
        f.id = formatId || undefined;
        thumbnails.push(f as Thumbnail);
      } else if (mediaKind === 'video' || mediaKind === 'audio') {
        const isAudio = mediaKind === 'audio';
        f.format_id = isAudio ? 'audio' : formatId || undefined;
        f.fps = int_or_none(mediaFile.fps) ?? undefined;
        if (isAudio) f.vcodec = 'none';
        formats.push(f);
      }
    }

    return {
      id: videoId,
      title: videoId,
      duration: int_or_none(data.duration) ?? undefined,
      thumbnails,
      formats,
    };
  }
}

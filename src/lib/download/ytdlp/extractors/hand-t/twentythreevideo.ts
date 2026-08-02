/**
 * TwentyThreeVideoIE — ported from yt-dlp twentythreevideo.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class TwentyThreeVideoIE extends InfoExtractor {
  static IE_NAME = '23video';
  static _VALID_URL =
    /https?:\/\/(?<domain>[^.]+\.(?:twentythree\.net|23video\.com|filmweb\.no))\/v\.ihtml\/player\.html\?(?<query>.*?\bphoto(?:_|%5f)id=(?<id>\d+).*)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const domain = m.groups!.domain!;
    const query = m.groups!.query!;
    const photoId = m.groups!.id!;
    const baseUrl = `https://${domain}`;

    const raw = await this._download_webpage(`${baseUrl}/api/photo/list?${query}`, photoId, undefined, {
      query: { format: 'json' },
    });
    const jsonMatch = raw.match(/({[\s\S]+})/);
    const parsedPhoto = this._parse_json<{ photo: Record<string, unknown> }>(
      jsonMatch?.[1] || '{}',
      photoId,
    );
    const photoData = parsedPhoto?.photo;
    if (!photoData) throw new ExtractorError('TwentyThreeVideo photo data missing', { expected: true });

    const formats: Format[] = [];
    const audioPath = photoData.audio_download;
    if (audioPath) {
      formats.push({
        format_id: 'audio',
        url: `${baseUrl}${audioPath}`,
        filesize: int_or_none(photoData.audio_size) ?? undefined,
        vcodec: 'none',
      });
    }

    const addFormat = (template: string, idField: 'format_id' | 'id', idValue: string) => {
      const base = template.replace('%s', idValue);
      const path = photoData[`${base}download`];
      if (!path) return;
      formats.push({
        [idField]: idValue,
        url: `${baseUrl}${path}`,
        width: int_or_none(photoData[`${base}width`]) ?? undefined,
        height: int_or_none(photoData[`${base}height`]) ?? undefined,
        filesize: int_or_none(photoData[`${base}size`]) ?? undefined,
      } as Format);
    };

    for (const f of ['mobile_high', 'medium', 'hd', '1080p', '4k']) {
      addFormat(`video_${f}_`, 'format_id', f);
    }

    const thumbnails: Thumbnail[] = [];
    for (const t of ['quad16', 'quad50', 'quad75', 'quad100', 'small', 'portrait', 'standard', 'medium', 'large', 'original']) {
      const path = photoData[`${t}_download`];
      if (!path) continue;
      thumbnails.push({
        id: t,
        url: `${baseUrl}${path}`,
        width: int_or_none(photoData[`${t}_width`]) ?? undefined,
        height: int_or_none(photoData[`${t}_height`]) ?? undefined,
      });
    }

    return {
      id: photoId,
      title: String(photoData.title || photoId),
      timestamp: int_or_none(photoData.creation_date_epoch) ?? undefined,
      duration: int_or_none(photoData.video_length) ?? undefined,
      view_count: int_or_none(photoData.view_count) ?? undefined,
      comment_count: int_or_none(photoData.number_of_comments) ?? undefined,
      uploader_id: photoData.user_id != null ? String(photoData.user_id) : undefined,
      uploader: photoData.display_name != null ? String(photoData.display_name) : undefined,
      thumbnails,
      formats,
    };
  }
}

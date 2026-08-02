/**
 * CinetecaMilanoIE — ported from yt-dlp cinetecamilano.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, traverse_obj } from '../../utils';
import { parseIso8601, stripOrNone, urljoin } from './_helpers';

export class CinetecaMilanoIE extends InfoExtractor {
  static IE_NAME = 'cinetecamilano';
  static _VALID_URL = /https?:\/\/(?:www\.)?cinetecamilano\.it\/film\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    let filmJson: Record<string, unknown>;
    try {
      filmJson = await this._download_json(`https://www.cinetecamilano.it/api/catalogo/${videoId}/?`, videoId, undefined, {
        headers: { Referer: url },
      });
    } catch {
      this.raise_login_required(undefined, undefined, 'cookies');
    }
    if (!filmJson.success || !filmJson.archive) {
      throw new ExtractorError('Video information not found');
    }
    const archive = filmJson.archive as Record<string, unknown>;

    return {
      id: videoId,
      title: (archive.title as string) || undefined,
      description: stripOrNone(archive.description) || undefined,
      duration: float_or_none(archive.duration, 1 / 60) ?? undefined,
      release_timestamp: parseIso8601(archive.updated_at) ?? undefined,
      modified_timestamp: parseIso8601(archive.created_at) ?? undefined,
      thumbnail: urljoin(
        url,
        String(
          traverse_obj(archive, ['thumb', 'src']) ?? '',
        ).replace('/public/', '/storage/') || '',
      ),
      formats: await this._extract_m3u8_formats(
        urljoin(url, String(traverse_obj(archive, ['drm', 'hls']) ?? '')),
        videoId,
        'mp4',
      ),
    };
  }
}

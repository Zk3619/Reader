/**
 * TFOIE — ported from yt-dlp tfo.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none } from '../../utils';

export class TFOIE extends InfoExtractor {
  static IE_NAME = 'tfo';
  static _GEO_COUNTRIES = ['CA'];
  static _VALID_URL = /https?:\/\/(?:www\.)?tfo\.org\/(?:en|fr)\/(?:[^/]+\/){2}(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    await this._download_webpage('http://www.tfo.org/', videoId, undefined, { fatal: false });
    const cookies = this._get_cookies('http://www.tfo.org/');
    const session = cookies['tfo-session'];
    if (!session) throw new ExtractorError('Missing tfo-session cookie', { expected: true });

    const infos = await this._download_json<Record<string, unknown>>(
      'http://www.tfo.org/api/web/video/get_infos',
      videoId,
      undefined,
      {
        method: 'POST',
        data: JSON.stringify({ product_id: videoId }),
        headers: { 'X-tfo-session': session, 'Content-Type': 'application/json' },
      },
    );

    if (infos.success === 0) {
      if (infos.code === 'ErrGeoBlocked') {
        this.raise_geo_restricted(undefined, TFOIE._GEO_COUNTRIES);
      }
      throw new ExtractorError(`${TFOIE.IE_NAME} said: ${clean_html(String(infos.msg || ''))}`, {
        expected: true,
      });
    }

    const videoData = (infos.data || {}) as Record<string, unknown>;
    return {
      _type: 'url_transparent',
      id: videoId,
      url: `limelight:media:${videoData.llid}`,
      title: videoData.title as string,
      description: (videoData.description as string) || undefined,
      series: (videoData.collection as string) || undefined,
      season_number: int_or_none(videoData.season) ?? undefined,
      episode_number: int_or_none(videoData.episode) ?? undefined,
      duration: int_or_none(videoData.duration) ?? undefined,
      extractor: 'LimelightMedia',
      extractor_key: 'LimelightMedia',
    };
  }
}

/**
 * TvigleIE — ported from yt-dlp tvigle.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none, try_get, url_or_none } from '../../utils';
import { parse_age_limit } from './_helpers';

export class TvigleIE extends InfoExtractor {
  static IE_NAME = 'tvigle';
  static IE_DESC = 'Интернет-телевидение Tvigle.ru';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:tvigle\.ru\/(?:[^/]+\/)+(?<display_id>[^/]+)\/|cloud\.tvigle\.ru\/video\/(?<id>\d+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let videoId = m.groups?.id;
    const displayId = m.groups?.display_id;

    if (!videoId) {
      const webpage = await this._download_webpage(url, displayId || url);
      videoId =
        this._html_search_regex(
          [
            /<div[^>]+class=["']player["'][^>]+id=["'](\d+)/,
            /cloudId\s*=\s*["'](\d+)/,
            /class="video-preview current_playing" id="(\d+)"/,
          ],
          webpage,
          'video id',
        ) || undefined;
    }
    if (!videoId) throw new ExtractorError('Unable to extract Tvigle video id', { expected: true });

    const videoData = await this._download_json<Record<string, unknown>>(
      `http://cloud.tvigle.ru/api/play/video/${videoId}/`,
      displayId || videoId,
    );
    const playlist = videoData.playlist as Record<string, unknown> | undefined;
    const items = (playlist?.items as unknown[]) || [];
    const item = (items[0] as Record<string, unknown>) || {};

    const videos = item.videos as Record<string, unknown> | undefined;
    const errorMessage = item.errorMessage != null ? String(item.errorMessage) : '';
    if (!videos && errorMessage) {
      if (item.isGeoBlocked === true) {
        this.raise_geo_restricted(errorMessage, ['RU']);
      }
      throw new ExtractorError(`${TvigleIE.IE_NAME} returned error: ${errorMessage}`, { expected: true });
    }

    const formats: Format[] = [];
    for (const [vcodec, urlOrFmts] of Object.entries(videos || {})) {
      if (vcodec === 'hls') {
        const m3u8Url = url_or_none(urlOrFmts);
        if (m3u8Url) {
          formats.push(
            ...(await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
          );
        }
      } else if (vcodec === 'dash') {
        const mpdUrl = url_or_none(urlOrFmts);
        if (mpdUrl) {
          formats.push(...(await this._extract_mpd_formats(mpdUrl, videoId, 'dash', undefined, false)));
        }
      } else if (urlOrFmts && typeof urlOrFmts === 'object') {
        for (const [formatId, videoUrlRaw] of Object.entries(urlOrFmts as Record<string, unknown>)) {
          if (formatId === 'm3u8') continue;
          const videoUrl = url_or_none(videoUrlRaw);
          if (!videoUrl) continue;
          const height = this._search_regex(/^(\d+)[pP]$/, formatId, 'height', null, false, 1);
          const filesize = int_or_none(
            try_get(item, (x: Record<string, unknown>) => {
              const vfs = x.video_files_size as Record<string, Record<string, unknown>> | undefined;
              return vfs?.[vcodec]?.[formatId];
            }) as unknown,
          );
          formats.push({
            url: videoUrl,
            format_id: `${vcodec}-${formatId}`,
            vcodec,
            height: int_or_none(height) ?? undefined,
            filesize: filesize ?? undefined,
          });
        }
      }
    }

    return {
      id: videoId,
      display_id: displayId || undefined,
      title: String(item.title || videoId),
      description: item.description != null ? String(item.description) : undefined,
      thumbnail: item.thumbnail != null ? String(item.thumbnail) : undefined,
      duration: float_or_none(item.durationMilliseconds, 0.001) ?? undefined,
      age_limit: parse_age_limit(String(item.ageRestrictions || '')) ?? undefined,
      formats,
    };
  }
}

// @ts-nocheck
/** WatIE â€?ported from yt-dlp wat.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, try_get, traverse_obj, unified_strdate } from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  mergeSubtitles,
} from './_helpers';

export class WatIE extends InfoExtractor {
  static IE_NAME = 'wat.tv';
  static _VALID_URL = /(?:wat:|https?:\/\/(?:www\.)?wat\.tv\/video\/.*-)(?<id>[0-9a-z]+)/;
  static _GEO_BYPASS = false;

  async _real_extract(url: string): Promise<VideoInfo> {
    let videoId = this._match_id(url);
    videoId =
      /^\d+$/.test(videoId) && videoId.length > 6 ? videoId : String(parseInt(videoId, 36));

    const videoData = await this._download_json<Record<string, unknown>>(
      `https://mediainfo.tf1.fr/mediainfocombo/${videoId}`,
      videoId,
      undefined,
      { query: { pver: '5010000' } },
    );
    const videoInfo = (videoData.media as Record<string, unknown>) || {};

    const errorDesc = videoInfo.error_desc as string | undefined;
    if (errorDesc) {
      const errorCode = videoInfo.error_code;
      if (errorCode === 'GEOBLOCKED') {
        this.raise_geo_restricted(errorDesc, videoInfo.geoList);
      } else if (errorCode === 'DELIVERY_ERROR') {
        const deliveryCode = traverse_obj(videoData, ['delivery', 'code']);
        if (deliveryCode === 403 || deliveryCode === 500) {
          this.report_drm(videoId);
        }
        const deliveryErr = traverse_obj(videoData, ['delivery', 'error', String]) as
          | string
          | undefined;
        throw new ExtractorError(
          [errorDesc, deliveryErr].filter((x) => typeof x === 'string' && x.length).join(': ') ||
            errorDesc,
          { expected: true },
        );
      }
      throw new ExtractorError(errorDesc, { expected: true });
    }

    const title = String(videoInfo.title || videoId);
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    const extractFormats = async (manifestUrls: Record<string, unknown>) => {
      for (const [f, fUrlRaw] of Object.entries(manifestUrls)) {
        const fUrl = typeof fUrlRaw === 'string' ? fUrlRaw : null;
        if (!fUrl) continue;
        if (f === 'dash' || f === 'mpd') {
          const res = await extractMpdFormatsAndSubtitles(
            this,
            fUrl.replace('://das-q1.tf1.fr/', '://das-q1-ssl.tf1.fr/'),
            videoId,
            'dash',
          );
          formats.push(...res.formats);
          mergeSubtitles(subtitles, res.subtitles);
        } else if (f === 'hls') {
          const res = await extractM3u8FormatsAndSubtitles(this, fUrl, videoId, 'hls');
          formats.push(...res.formats);
          mergeSubtitles(subtitles, res.subtitles);
        }
      }
    };

    const delivery = (videoData.delivery as Record<string, unknown>) || {};
    await extractFormats({ [String(delivery.format || '')]: delivery.url });
    if (!formats.length) {
      if (delivery.drm) this.report_drm(videoId);
      const manifestUrls = await this._download_json<Record<string, unknown>>(
        `http://www.wat.tv/get/webhtml/${videoId}`,
        videoId,
        undefined,
        { fatal: false },
      );
      if (manifestUrls && Object.keys(manifestUrls).length) {
        await extractFormats(manifestUrls);
      }
    }

    return {
      id: videoId,
      title,
      thumbnail: (videoInfo.preview as string) || undefined,
      upload_date:
        unified_strdate(
          try_get(videoData, (x) => {
            const chapters = (
              (x as { mediametrie?: { chapters?: Array<{ estatS4?: string }> } }).mediametrie
                ?.chapters || []
            )[0];
            return chapters?.estatS4;
          }),
        ) ?? undefined,
      duration: int_or_none(videoInfo.duration) ?? undefined,
      formats,
      subtitles,
    };
  }
}

/** SinaIE — ported from yt-dlp sina.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, int_or_none, update_url_query } from '../../utils';
import { get_element_by_attribute, qualities } from './_helpers';

export class SinaIE extends InfoExtractor {
  static IE_NAME = 'sina';
  static _VALID_URL =
    /https?:\/\/(?:[^/?#]+\.)?video\.sina\.com\.cn\/(?:view\/|.*#)(?<id>\d+)|(?:.+?\/(?<pseudo_id>[^/?#]+)(?:\.s?html)|api\/sinawebApi\/outplay\.php\/(?<token>.+?)\.swf)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let videoId = m.groups?.id;

    if (!videoId) {
      if (m.groups?.token) {
        const resp = await this._request_webpage(url, 'NA', undefined, { fatal: false });
        if (resp?.url) return this._real_extract(resp.url);
        throw new ExtractorError('Could not resolve redirect URL');
      }
      const pseudoId = m.groups!.pseudo_id!;
      const webpage = await this._download_webpage(url, pseudoId);
      const error = get_element_by_attribute('class', 'errtitle', webpage);
      if (error) throw new ExtractorError(`${this.IE_NAME} said: ${clean_html(error)}`, { expected: true });
      videoId = this._search_regex(/video_id\s*:\s*'(\d+)'/, webpage, 'video id')!;
    }

    const videoData = await this._download_json<{ code?: number; message?: string; data?: Record<string, unknown> }>(
      'http://s.video.sina.com.cn/video/h5play',
      videoId,
      undefined,
      { query: { video_id: videoId } },
    );
    if (videoData.code !== 1) {
      throw new ExtractorError(`${this.IE_NAME} said: ${videoData.message}`, { expected: true });
    }
    const data = videoData.data!;
    const preference = qualities(['cif', 'sd', 'hd', 'fhd', 'ffd']);
    const formats: Format[] = [];
    const mp4Map = ((data.videos as Record<string, unknown>)?.mp4 as Record<string, Record<string, unknown>>) || {};
    for (const [qualityId, quality] of Object.entries(mp4Map)) {
      const fileApi = quality.file_api as string | undefined;
      const fileId = quality.file_id as string | undefined;
      if (!fileApi || !fileId) continue;
      formats.push({
        format_id: qualityId,
        url: update_url_query(fileApi, { vid: fileId }),
        quality: preference(qualityId),
        ext: 'mp4',
      });
    }

    return {
      id: videoId,
      title: data.title as string | undefined,
      description: (data.description as string | undefined)?.trim(),
      thumbnail: data.image as string | undefined,
      duration: int_or_none(data.length) ?? undefined,
      timestamp: int_or_none(data.create_time) ?? undefined,
      formats,
    };
  }
}

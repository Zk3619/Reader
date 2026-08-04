// @ts-nocheck
/** XinpianchangIE â€?ported from yt-dlp xinpianchang.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, str_or_none, try_get, url_or_none } from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  mergeSubtitles,
  searchNextjsData,
} from './_helpers';

export class XinpianchangIE extends InfoExtractor {
  static IE_NAME = 'Xinpianchang';
  static IE_DESC = 'xinpianchang';
  static _VALID_URL = /https?:\/\/(www\.)?xinpianchang\.com\/(?<id>a\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId, undefined, {
      headers: { Referer: url },
    });
    const nextProps = searchNextjsData(this, webpage, videoId);
    const videoData = try_get(nextProps, (x) => {
      const props = x as {
        pageProps?: { detail?: { video?: Record<string, unknown> } };
      };
      return props.pageProps?.detail?.video;
    }) as Record<string, unknown>;

    const data = (
      await this._download_json<{ data: Record<string, unknown> }>(
        `https://mod-api.xinpianchang.com/mod/api/v2/media/${videoData.vid}`,
        videoId,
        undefined,
        { query: { appKey: String(videoData.appKey || '') } },
      )
    ).data;

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    const resource = (data.resource as Record<string, unknown>) || {};

    for (const [k, vRaw] of Object.entries(resource)) {
      const v = (vRaw || {}) as Record<string, unknown>;
      if (k === 'dash' || k === 'hls') {
        const vUrl = v.url as string | undefined;
        if (!vUrl) continue;
        if (k === 'dash') {
          const res = await extractMpdFormatsAndSubtitles(this, vUrl, videoId);
          formats.push(...res.formats);
          subtitles = mergeSubtitles(subtitles, res.subtitles);
        } else {
          const res = await extractM3u8FormatsAndSubtitles(this, vUrl, videoId);
          formats.push(...res.formats);
          subtitles = mergeSubtitles(subtitles, res.subtitles);
        }
      } else if (k === 'progressive') {
        const progressive = Array.isArray(vRaw) ? vRaw : [];
        for (const prog of progressive) {
          if (!prog || typeof prog !== 'object') continue;
          const p = prog as Record<string, unknown>;
          const pUrl = url_or_none(p.url);
          if (!pUrl) continue;
          formats.push({
            url: pUrl,
            format_id: 'http',
            width: int_or_none(p.width) ?? undefined,
            height: int_or_none(p.height) ?? undefined,
            ext: 'mp4',
            http_headers: {
              // NB: Server returns 403 without the Range header
              Range: 'bytes=0-',
            },
          });
        }
      }
    }

    return {
      id: videoId,
      title: (data.title as string) || videoId,
      description: (data.description as string) || undefined,
      duration: int_or_none(data.duration) ?? undefined,
      categories: Array.isArray(data.categories)
        ? (data.categories as string[])
        : undefined,
      tags: Array.isArray(data.keywords) ? (data.keywords as string[]) : undefined,
      thumbnail: (data.cover as string) || undefined,
      uploader: try_get(data, (x) => (x as { owner?: { username?: string } }).owner?.username) || undefined,
      uploader_id:
        str_or_none(try_get(data, (x) => (x as { owner?: { id?: unknown } }).owner?.id)) ||
        undefined,
      formats,
      subtitles,
    };
  }
}

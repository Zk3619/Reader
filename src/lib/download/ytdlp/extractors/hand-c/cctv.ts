/** 央视网 (CCTV) — ported from yt-dlp cctv.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, unified_timestamp } from '../../utils';

export class CCTVIE extends InfoExtractor {
  static IE_NAME = 'cctv';
  static IE_DESC = 'cctv.cn';
  static _VALID_URL =
    /^https?:\/\/(?:(?:[^/]+)\.(?:cntv|cctv)\.(?:com|cn)|(?:www\.)?ncpa-classic\.com)\/(?:[^/]+\/)*?(?<id>[^/?#&]+?)(?:\/index)?(?:\.s?html|[?#&]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, this._match_id(url));

    const videoId = this._search_regex(
      [
        /var\s+guid\s*=\s*["']([\da-fA-F]+)/,
        /videoCenterId(?:["']\s*,|:)\s*["']([\da-fA-F]+)/,
        /changePlayer\s*\(\s*["']([\da-fA-F]+)/,
        /load[Vv]ideo\s*\(\s*["']([\da-fA-F]+)/,
        /var\s+initMyAray\s*=\s*["']([\da-fA-F]+)/,
        /var\s+ids\s*=\s*\[["']([\da-fA-F]+)/,
      ],
      webpage,
      'video id',
    )!;

    const data = await this._download_json<Record<string, unknown>>(
      'http://vdn.apps.cntv.cn/api/getHttpVideoInfo.do',
      videoId,
      undefined,
      { query: { pid: videoId, url, idl: '32', idlr: '32', deviceed: 'false' } },
    );

    const title = String(data.title || '');
    const formats: Format[] = [];

    const video = data.video as Record<string, unknown> | undefined;
    if (video && typeof video === 'object') {
      let quality = 0;
      for (const chaptersKey of ['lowChapters', 'chapters']) {
        const chapters = video[chaptersKey] as Record<string, unknown>[] | undefined;
        const videoUrl = chapters?.[0]?.url as string | undefined;
        if (videoUrl) {
          formats.push({ url: videoUrl, format_id: 'http', quality, preference: -10 });
        }
        quality++;
      }
    }

    let hlsUrl = data.hls_url as string | undefined;
    if (hlsUrl) {
      hlsUrl = hlsUrl.replace(/maxbr=\d+&?/g, '');
      formats.push(
        ...(await this._extract_m3u8_formats(
          hlsUrl,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        )),
      );
    }

    const uploader = (data.editer_name as string) || undefined;
    const description = this._html_search_meta('description', webpage, undefined, false) ?? undefined;
    const timestamp = unified_timestamp(data.f_pgmtime) ?? undefined;
    const duration = float_or_none((video as Record<string, unknown> | undefined)?.totalLength) ?? undefined;

    return { id: videoId, title, description, uploader, timestamp, duration, formats };
  }
}

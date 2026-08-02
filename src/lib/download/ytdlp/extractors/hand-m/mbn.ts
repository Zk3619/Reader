/** MBNIE — ported from yt-dlp mbn.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, unified_strdate, url_or_none } from '../../utils';

export class MBNIE extends InfoExtractor {
  static IE_NAME = 'mbn';
  static IE_DESC = 'mbn.co.kr (매일방송)';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?mbn\.co\.kr\/vod\/programContents\/preview(?:list)?\/\d+\/\d+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const contentId = this._match_id(url);
    const webpage = await this._download_webpage(url, contentId);
    const contentClsCd =
      this._search_regex(/"\?content_cls_cd=(\d+)&/, webpage, 'content cls cd', null, false) || '20';
    const mediaInfo = await this._download_json<Record<string, unknown>>(
      'https://www.mbn.co.kr/player/mbnVodPlayer_2020.mbn',
      contentId,
      'Fetching playback data',
      {
        query: {
          content_cls_cd: contentClsCd,
          content_id: contentId,
          relay_type: '1',
        },
      },
    );

    const formats: Format[] = [];
    for (const streamUrl of ((mediaInfo.movie_list as unknown[]) || [])) {
      let rawUrl = url_or_none((streamUrl as Record<string, unknown>).url);
      if (!rawUrl) continue;
      rawUrl = rawUrl.replace(/\/(?:chunk|play)list(?:_pd\d+)?\.m3u8/, '/manifest.m3u8');
      const authPage = await this._download_webpage(
        `https://www.mbn.co.kr/player/mbnStreamAuth_new_vod.mbn?vod_url=${encodeURIComponent(rawUrl)}`,
        contentId,
        'Fetching authenticated m3u8 url',
        { fatal: false },
      );
      const finalUrl = url_or_none(authPage?.match(/https?:\/\/[^\s"'<>]+\.m3u8/i)?.[0]);
      if (finalUrl) {
        formats.push(...(await this._extract_m3u8_formats(finalUrl, contentId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)));
      }
    }

    const releaseRaw = str_or_none(mediaInfo.bcast_date)?.replace(/\./g, '');
    return {
      id: contentId,
      title: str_or_none(mediaInfo.movie_title) ?? undefined,
      duration: int_or_none(mediaInfo.play_sec) ?? undefined,
      release_date: releaseRaw ? unified_strdate(releaseRaw) ?? undefined : undefined,
      thumbnail: url_or_none(mediaInfo.movie_start_Img) ?? undefined,
      series: str_or_none(mediaInfo.prog_nm) ?? undefined,
      episode_number: int_or_none(mediaInfo.ad_contentnumber) ?? undefined,
      formats,
    };
  }
}

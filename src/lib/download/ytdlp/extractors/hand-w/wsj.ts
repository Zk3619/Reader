// @ts-nocheck
/** WSJIE / WSJArticleIE ù?ported from yt-dlp wsj.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none, unified_strdate } from '../../utils';

export class WSJIE extends InfoExtractor {
  static IE_NAME = 'wsj';
  static IE_DESC = 'Wall Street Journal';
  static REQUIRES_TLS_IMPERSONATE = true;
  static _VALID_URL =
    /(?:https?:\/\/video-api\.wsj\.com\/api-video\/player\/iframe\.html\?.*?\bguid=|https?:\/\/(?:www\.)?(?:wsj|barrons)\.com\/video\/(?:[^/]+\/)+|wsj:)(?<id>[a-fA-F0-9-]{36})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const info = (
      await this._download_json<{ items: Array<Record<string, unknown>> }>(
        'http://video-api.wsj.com/api-video/find_all_videos.asp',
        videoId,
        undefined,
        {
          query: {
            type: 'guid',
            count: '1',
            query: videoId,
            fields: [
              'type',
              'hls',
              'videoMP4List',
              'thumbnailList',
              'author',
              'description',
              'name',
              'duration',
              'videoURL',
              'titletag',
              'formattedCreationDate',
              'keywords',
              'editor',
            ].join(','),
          },
        },
      )
    ).items[0]!;

    const title = String(info.name || info.titletag || videoId);
    const formats: Format[] = [];

    // HDS/f4m: runtime has no _extract_f4m_formats ù?skip videoURL/hds path.
    const m3u8Url = info.hls as string | undefined;
    if (m3u8Url) {
      formats.push(
        ...(await this._extract_m3u8_formats(
          m3u8Url,
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

    for (const v of (info.videoMP4List as Array<Record<string, unknown>>) || []) {
      const mp4Url = v.url as string | undefined;
      if (!mp4Url) continue;
      const tbr = int_or_none(v.bitrate);
      formats.push({
        url: mp4Url,
        format_id: tbr != null ? `http-${tbr}` : 'http',
        tbr: tbr ?? undefined,
        width: int_or_none(v.width) ?? undefined,
        height: int_or_none(v.height) ?? undefined,
        fps: float_or_none(v.fps) ?? undefined,
      });
    }

    return {
      id: videoId,
      formats,
      thumbnails: info.thumbnailList as VideoInfo['thumbnails'],
      creator: info.author as string | undefined,
      uploader_id: info.editor as string | undefined,
      duration: int_or_none(info.duration) ?? undefined,
      upload_date: unified_strdate(info.formattedCreationDate) || undefined,
      title,
      categories: info.keywords as string[] | undefined,
    };
  }
}

export class WSJArticleIE extends InfoExtractor {
  static IE_NAME = 'wsj:article';
  static REQUIRES_TLS_IMPERSONATE = true;
  static _VALID_URL =
    /https?:\/\/(?:www\.)?wsj\.com\/(?:articles|opinion)\/(?<id>[^/?#&]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    // Upstream impersonate=True ù use Chrome Client-Hints profile via networking/impersonate
    if (this.params.impersonate == null) {
      (this.params as { impersonate?: boolean | string }).impersonate = true;
    }
    const webpage = await this._download_webpage(url, articleId);
    const videoId = this._search_regex(
      /(?:id=["']video|video-|iframe\.html\?guid=|data-src=["'])([a-fA-F0-9-]{36})/,
      webpage,
      'video id',
    )!;
    return this.url_result(`wsj:${videoId}`, 'WSJ', videoId);
  }
}

/**
 * IqIE / IqAlbumIE — ported from yt-dlp iqiyi.py (international iq.com)
 *
 * IqiyiIE lives in extractors/iqiyi.ts — not included here.
 * IqIE dash signing (PhantomJS/cmd5x) is not portable — extraction raises when signing is required.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, traverse_obj } from '../../utils';
import { searchNextjsData } from './_helpers';

export class IqIE extends InfoExtractor {
  static IE_NAME = 'iq.com';
  static IE_DESC = 'International version of iQiyi';
  static _VALID_URL = /https?:\/\/(?:www\.)?iq\.com\/play\/(?:[\w%-]*-)?(?<id>\w+)/;

  protected _getCookie(name: string, defaultValue: string | null = null): string | null {
    return this._get_cookies('https://iq.com/')[name] || defaultValue;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const nextProps = searchNextjsData(this, webpage, videoId);
    const pageData = traverse_obj(nextProps, ['initialState', 'play']) as Record<string, unknown>;
    const videoInfo = (pageData?.curVideoInfo || {}) as Record<string, unknown>;
    void videoInfo;

    throw new ExtractorError(
      'iq.com format extraction requires cmd5x JS signing (PhantomJS) — not yet implemented in this port',
      { expected: true },
    );
  }
}

export class IqAlbumIE extends InfoExtractor {
  static IE_NAME = 'iq.com:album';
  static _VALID_URL = /https?:\/\/(?:www\.)?iq\.com\/album\/(?:[\w%-]*-)?(?<id>\w+)/;

  protected async *_entries(
    albumIdNum: unknown,
    pageRanges: Array<Record<string, unknown>>,
    albumId: string,
    modeCode = 'intl',
    langCode = 'en_us',
  ): AsyncGenerator<VideoInfo> {
    for (const pageRange of pageRanges) {
      const page = await this._download_json<{ data?: { epg?: Array<Record<string, unknown>> } }>(
        `https://pcw-api.iq.com/api/episodeListSource/${albumIdNum}`,
        albumId,
        String(pageRange.msg ?? 'Downloading video list'),
        {
          query: {
            platformId: '3',
            modeCode,
            langCode,
            endOrder: String(pageRange.to ?? ''),
            startOrder: String(pageRange.from ?? ''),
          },
        },
      );
      for (const video of page.data?.epg || []) {
        const suffix = video.playLocSuffix != null ? String(video.playLocSuffix) : String(video.qipuIdStr ?? '');
        yield this.url_result(
          `https://www.iq.com/play/${suffix}`,
          'Iq',
          str_or_none(video.qipuIdStr) || suffix,
          video.name != null ? String(video.name) : null,
        );
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const albumId = this._match_id(url);
    const webpage = await this._download_webpage(url, albumId);
    const nextData = searchNextjsData(this, webpage, albumId);
    const albumData = traverse_obj(nextData, ['initialState', 'album', 'videoAlbumInfo']) as Record<string, unknown>;

    if (albumData.videoType === 'singleVideo') {
      return this.url_result(`https://www.iq.com/play/${albumId}`, 'Iq');
    }

    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(
      albumData.albumId,
      (albumData.totalPageRange as Array<Record<string, unknown>>) || [],
      albumId,
      traverse_obj(nextData, ['initialProps', 'pageProps', 'modeCode']) as string | undefined,
      traverse_obj(nextData, ['initialProps', 'pageProps', 'langCode']) as string | undefined,
    )) {
      entries.push(entry);
    }

    return this.playlist_result(
      entries,
      albumId,
      albumData.name != null ? String(albumData.name) : albumId,
      albumData.desc != null ? String(albumData.desc) : null,
    );
  }
}

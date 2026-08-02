/**
 * LeFigaroVideoEmbedIE / LeFigaroVideoSectionIE — ported from yt-dlp lefigaro.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, traverse_obj, url_or_none } from '../../utils';
import { searchNextjsData } from './_helpers';

export class LeFigaroVideoEmbedIE extends InfoExtractor {
  static IE_NAME = 'lefigaro:embed';
  static _VALID_URL = /https?:\/\/video\.lefigaro\.fr\/embed\/[^?#]+\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const props = searchNextjsData(this, webpage, displayId);
    const playerData = traverse_obj(props, [
      'pageProps',
      'initialProps',
      'pageData',
      'playerData',
    ]) as Record<string, unknown>;

    return {
      ...this.url_result(
        `jwplatform:${playerData.videoId}`,
        undefined,
        String(playerData.videoId ?? displayId),
        str_or_none(playerData.title) ?? undefined,
      ),
      description: str_or_none(playerData.description) ?? undefined,
      thumbnail: playerData.poster ? String(playerData.poster) : undefined,
    };
  }
}

export class LeFigaroVideoSectionIE extends InfoExtractor {
  static IE_NAME = 'lefigaro:section';
  static _VALID_URL = /https?:\/\/video\.lefigaro\.fr\/figaro\/(?<id>[\w-]+)\/?(?:[#?]|$)/;
  static _PAGE_SIZE = 20;

  protected async _getApiResponse(displayId: string, pageNum: number, note?: string) {
    return this._download_json<Record<string, unknown>>(
      'https://api-graphql.lefigaro.fr/graphql',
      displayId,
      note,
      {
        query: {
          id: 'flive-website_UpdateListPage_1fb260f996bca2d78960805ac382544186b3225f5bedb43ad08b9b8abef79af6',
          variables: JSON.stringify({
            slug: displayId,
            videosLimit: LeFigaroVideoSectionIE._PAGE_SIZE,
            sort: 'DESC',
            order: 'PUBLISHED_AT',
            page: pageNum,
          }),
        },
      },
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const initialResponse = ((await this._getApiResponse(displayId, 1))?.data as Record<string, unknown>)?.playlist as Record<
      string,
      unknown
    >;
    const videoCount = Number(initialResponse?.videoCount ?? 0);
    const totalPages = Math.ceil(videoCount / LeFigaroVideoSectionIE._PAGE_SIZE) || 1;

    const entries: VideoInfo[] = [];
    for (let page = 1; page <= totalPages; page++) {
      const apiResponse = await this._getApiResponse(
        displayId,
        page,
        page > 1 ? `Downloading page ${page}` : undefined,
      );
      const playlist = traverse_obj(apiResponse, ['data', 'playlist']) as Record<string, unknown>;
      const items = traverse_obj(playlist, ['jsonLd', 0, 'itemListElement']) as Array<Record<string, unknown>>;
      for (const video of items || []) {
        entries.push({
          ...this.url_result(String(video.embedUrl ?? ''), 'LeFigaroVideoEmbed', undefined, str_or_none(video.name) ?? undefined),
          description: str_or_none(video.description) ?? undefined,
          thumbnail: url_or_none(video.thumbnailUrl) ?? undefined,
        });
      }
    }

    return this.playlist_result(entries, displayId, str_or_none(initialResponse?.title) ?? displayId);
  }
}

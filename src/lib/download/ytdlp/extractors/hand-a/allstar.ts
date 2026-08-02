/**
 * AllstarIE / AllstarProfileIE — aligned with yt-dlp allstar.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { int_or_none, join_nonempty, parse_qs, traverse_obj } from '../../utils';
import { urljoin } from './_helpers';

const FIELDS = `
    _id
    clipImageSource
    clipImageThumb
    clipLink
    clipTitle
    createdDate
    shareId
    user { _id }
    username
    views`;

const EXTRA_FIELDS = `
    clipLength
    clipSizeBytes`;

const QUERIES: Record<string, string> = {
  clip:
    'query ($id: String!) { video: getClip(clipIdentifier: $id) { ' + FIELDS + EXTRA_FIELDS + ' } }',
  montage: 'query ($id: String!) { video: getMontage(clipIdentifier: $id) { ' + FIELDS + ' } }',
  Clips:
    'query ($page: Int!, $user: String!, $game: Int) { videos: clips(search: createdDate, page: $page, user: $user, mobile: false, game: $game) { data { ' +
    FIELDS +
    EXTRA_FIELDS +
    ' } } }',
  Montages:
    'query ($page: Int!, $user: String!) { videos: montages(search: createdDate, page: $page, user: $user) { data { ' +
    FIELDS +
    ' } } }',
  'Mobile Clips':
    'query ($page: Int!, $user: String!) { videos: clips(search: createdDate, page: $page, user: $user, mobile: true) { data { ' +
    FIELDS +
    EXTRA_FIELDS +
    ' } } }',
};

export class AllstarBaseIE extends InfoExtractor {
  static IE_NAME = 'AllstarBase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AllstarBaseIE is not a standalone extractor', { expected: true });
  }

  protected _parseVideoData(videoData: Record<string, unknown>): VideoInfo {
    const mediaUrlOrNone = (path: unknown) => urljoin('https://media.allstar.gg/', String(path || ''));

    const info: VideoInfo = {
      id: String(traverse_obj(videoData, ['_id', { expected_type: String }]) || ''),
      display_id: traverse_obj(videoData, ['shareId', { expected_type: String }]) as string | undefined,
      title: traverse_obj(videoData, ['clipTitle', { expected_type: String }]) as string | undefined,
      url: mediaUrlOrNone(videoData.clipLink) || undefined,
      thumbnails: [
        traverse_obj(videoData, ['clipImageThumb', mediaUrlOrNone]),
        traverse_obj(videoData, ['clipImageSource', mediaUrlOrNone]),
      ].filter(Boolean) as Thumbnail[],
      duration: int_or_none(videoData.clipLength) ?? undefined,
      filesize: int_or_none(videoData.clipSizeBytes) ?? undefined,
      timestamp: int_or_none(videoData.createdDate, 1000) ?? undefined,
      uploader: traverse_obj(videoData, ['username', { expected_type: String }]) as string | undefined,
      uploader_id: traverse_obj(videoData, ['user', '_id', { expected_type: String }]) as string | undefined,
      view_count: int_or_none(videoData.views) ?? undefined,
      extractor: 'allstar',
      extractor_key: 'Allstar',
    };

    if (info.id && info.url) {
      const basename = String(info.url).includes('/clips/') ? 'clip' : 'montage';
      info.webpage_url = `https://allstar.gg/${basename}?${basename}=${info.id}`;
    }
    if (info.uploader_id) {
      info.uploader_url = urljoin('https://allstar.gg/u/', info.uploader_id);
    }
    return info;
  }

  protected async _callApi(
    query: string,
    variables: Record<string, unknown>,
    path: string[],
    videoId?: string,
    note?: string,
  ): Promise<unknown> {
    const response = await this._download_json<Record<string, unknown>>(
      'https://a1.allstar.gg/graphql',
      videoId,
      note || 'Downloading Allstar GraphQL',
      {
        data: JSON.stringify({ variables, query }),
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      },
    );

    const errList = (response.errors as Array<{ message?: string }> | undefined) || [];
    const errors = errList.map((e) => e.message).filter(Boolean) as string[];
    if (errors.length) throw new ExtractorError(errors.join('; '));

    return traverse_obj(response, path);
  }
}

export class AllstarIE extends AllstarBaseIE {
  static IE_NAME = 'allstar';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?allstar\.gg\/(?<type>(?:clip|montage))\?(?:clip|montage)=(?<id>[^/?#&]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const queryId = m!.groups!.type as string;
    const videoId = m!.groups!.id as string;
    const query = QUERIES[queryId];
    if (!query) throw new ExtractorError(`Unsupported Allstar type ${queryId}`, { expected: true });

    const videoData = (await this._callApi(query, { id: videoId }, ['data', 'video'], videoId)) as Record<
      string,
      unknown
    >;
    return this._parseVideoData(videoData);
  }
}

export class AllstarProfileIE extends AllstarBaseIE {
  static IE_NAME = 'allstarprofile';
  static _VALID_URL = /https?:\/\/(?:www\.)?allstar\.gg\/(?:profile\?user=|u\/)(?<id>[^/?#&]+)/i;
  static _PAGE_SIZE = 10;

  protected async *_getPage(
    userId: string,
    displayId: string,
    game: number | null | undefined,
    query: string,
    pageNum: number,
  ): AsyncGenerator<VideoInfo> {
    const videos = (await this._callApi(
      query,
      { user: userId, page: pageNum + 1, game },
      ['data', 'videos', 'data'],
      displayId,
      `Downloading page ${pageNum + 1}`,
    )) as Record<string, unknown>[];

    for (const videoData of videos || []) {
      yield this._parseVideoData(videoData);
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const profileData = await this._download_json<Record<string, unknown>>(
      urljoin('https://api.allstar.gg/v1/users/profile/', displayId),
      displayId,
    );
    const userId = traverse_obj(profileData, ['data', '_id', { expected_type: String }]) as string | undefined;
    if (!userId) throw new ExtractorError('Unable to extract the user id', { expected: true });

    const username = traverse_obj(profileData, ['data', 'profile', 'username', { expected_type: String }]) as
      | string
      | undefined;
    const urlQuery = parse_qs(url);
    const game = int_or_none(urlQuery.game?.[0]);
    const queryId = urlQuery.view?.[0] || 'Clips';

    if (!['Clips', 'Montages', 'Mobile Clips'].includes(queryId)) {
      throw new ExtractorError(`Unsupported playlist URL type ${JSON.stringify(queryId)}`, { expected: true });
    }

    const query = QUERIES[queryId]!;
    const entries: VideoInfo[] = [];
    for (let page = 0; page < 500; page++) {
      const batch: VideoInfo[] = [];
      for await (const item of this._getPage(userId, displayId, game, query, page)) {
        batch.push(item);
      }
      if (!batch.length) break;
      entries.push(...batch);
      if (batch.length < AllstarProfileIE._PAGE_SIZE) break;
    }

    return this.playlist_result(
      entries,
      join_nonempty(userId, queryId.toLowerCase().split(' ')[0], game ? String(game) : undefined).replace(/ /g, '-'),
      join_nonempty(username || displayId, queryId, game ? String(game) : undefined, ' - '),
    );
  }
}

/**
 * FrontoBase / FrontroVideoBase / FrontroGroupBase ??ported from yt-dlp frontro.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601 } from './_helpers';

export class FrontoBaseIE extends InfoExtractor {
  static IE_NAME = 'frontobase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('FrontoBaseIE is not a standalone extractor', { expected: true });
  }

  protected _getAuthHeaders(url: string): Record<string, string> {
    void url;
    return {};
  }
}

export class FrontroVideoBaseIE extends FrontoBaseIE {
  static IE_NAME = 'frontrovideobase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _CHANNEL_ID: string | null = null;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const Ctor = this.constructor as typeof FrontroVideoBaseIE;
    const metadata = (
      await this._download_json<{ data?: { video?: Record<string, unknown> } }>(
        'https://api.frontrow.cc/query',
        videoId,
        undefined,
        {
          data: JSON.stringify({
            operationName: 'Video',
            variables: { channelID: Ctor._CHANNEL_ID, videoID: videoId },
            query: `query Video($channelID: ID!, $videoID: ID!) {
              video(ChannelID: $channelID, VideoID: $videoID) {
                ... on Video {title description updatedAt thumbnail createdAt duration likeCount comments views url hasAccess}
              }
            }`,
          }),
          method: 'POST',
          headers: { 'content-type': 'application/json', ...this._getAuthHeaders(url) },
        },
      )
    ).data?.video;

    if (!metadata?.hasAccess) this.raise_login_required();

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      String(metadata.url ?? ''),
      videoId,
    );

    return {
      id: videoId,
      formats,
      subtitles,
      title: traverse_obj(metadata, ['title', String]) as string | undefined,
      description: traverse_obj(metadata, ['description', String]) as string | undefined,
      thumbnail: traverse_obj(metadata, ['thumbnail', url_or_none]) as string | undefined,
      timestamp: parseIso8601(metadata.createdAt) ?? undefined,
      modified_timestamp: parseIso8601(metadata.updatedAt) ?? undefined,
      duration: int_or_none(metadata.duration) ?? undefined,
      like_count: int_or_none(metadata.likeCount) ?? undefined,
      comment_count: int_or_none(metadata.comments) ?? undefined,
      view_count: int_or_none(metadata.views) ?? undefined,
    };
  }
}

export class FrontroGroupBaseIE extends FrontoBaseIE {
  static IE_NAME = 'frontrogroupbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _CHANNEL_ID: string | null = null;
  static _VIDEO_EXTRACTOR: string | null = null;
  static _VIDEO_URL_TMPL: string | null = null;

  async _real_extract(url: string): Promise<VideoInfo> {
    const groupId = this._match_id(url);
    const Ctor = this.constructor as typeof FrontroGroupBaseIE;
    const metadata = (
      await this._download_json<{ data?: { pageContainer?: Record<string, unknown> } }>(
        'https://api.frontrow.cc/query',
        groupId,
        'Downloading playlist metadata',
        {
          data: JSON.stringify({
            operationName: 'PaginatedStaticPageContainer',
            variables: { channelID: Ctor._CHANNEL_ID, first: 500, pageContainerID: groupId },
            query: `query PaginatedStaticPageContainer($channelID: ID!, $pageContainerID: ID!) {
              pageContainer(ChannelID: $channelID, PageContainerID: $pageContainerID) {
                ... on StaticPageContainer { id title updatedAt createdAt itemRefs {edges {node {
                  id contentItem { ... on ItemVideo { videoItem: item { id }}}
                }}}}
              }
            }`,
          }),
          method: 'POST',
          headers: { 'content-type': 'application/json', ...this._getAuthHeaders(url) },
        },
      )
    ).data?.pageContainer;

    const entries: VideoInfo[] = [];
    const edges = traverse_obj(metadata, ['itemRefs', 'edges']) as Array<Record<string, unknown>> | undefined;
    for (const edge of edges || []) {
      const videoId = traverse_obj(edge, ['node', 'contentItem', 'videoItem', 'id', String]) as
        | string
        | undefined;
      if (!videoId || !Ctor._VIDEO_URL_TMPL) continue;
      entries.push(
        this.url_result(Ctor._VIDEO_URL_TMPL.replace('%s', videoId), Ctor._VIDEO_EXTRACTOR || undefined, videoId),
      );
    }

    return {
      _type: 'playlist',
      id: groupId,
      entries,
      title: traverse_obj(metadata, ['title', String]) as string | undefined,
      timestamp: parseIso8601(metadata?.createdAt) ?? undefined,
      modified_timestamp: parseIso8601(metadata?.updatedAt) ?? undefined,
    };
  }
}

/**
 * TV5UnisBaseIE / TV5UnisVideoIE / TV5UnisIE — ported from yt-dlp tv5unis.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, join_nonempty, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parse_age_limit } from './_helpers';

export class TV5UnisBaseIE extends InfoExtractor {
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  protected static _GQL_QUERY_NAME = '';
  protected static _gqlArgs(_groups: Record<string, string | undefined>): string {
    return '';
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const groups = this._match_valid_url(url)!.groups || {};
    const ctor = this.constructor as typeof TV5UnisBaseIE;
    const gqlName = ctor._GQL_QUERY_NAME;
    const gqlArgs = ctor._gqlArgs(groups);
    const product = (
      await this._download_json<{ data: Record<string, Record<string, unknown>> }>(
        'https://api.tv5unis.ca/graphql',
        groups.id || url,
        undefined,
        {
          query: {
            query: `{ ${gqlName}(${gqlArgs}) {
    title summary tags duration seasonNumber episodeNumber
    collection { title }
    rating { name }
    videoElement {
      __typename
      ... on Video { mediaId encodings { hls { url } } }
      ... on RestrictedVideo { code reason }
    }
  } }`,
          },
        },
      )
    ).data[gqlName];

    const video = product.videoElement as Record<string, unknown> | null;
    if (!video) throw new ExtractorError('This content is no longer available', { expected: true });

    if (video.__typename === 'RestrictedVideo') {
      const code = video.code;
      if (code === 1001) this.raise_geo_restricted(undefined, ['CA']);
      throw new ExtractorError(
        join_nonempty(
          'This video is restricted',
          code != null ? `, error code ${code}` : '',
          video.reason ? `: ${String(video.reason).replace(/\.$/, '')}` : '',
        ) || 'Restricted',
        { expected: true },
      );
    }

    const mediaId = String(video.mediaId);
    const hlsUrl = traverse_obj(video, ['encodings', 'hls', 'url']) as string;
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, hlsUrl, mediaId, 'mp4');

    return {
      id: mediaId,
      formats,
      subtitles,
      title: product.title != null ? String(product.title) : undefined,
      description: product.summary != null ? String(product.summary) : undefined,
      tags: Array.isArray(product.tags) ? product.tags.map(String) : undefined,
      duration: int_or_none(product.duration) ?? undefined,
      season_number: int_or_none(product.seasonNumber) ?? undefined,
      episode_number: int_or_none(product.episodeNumber) ?? undefined,
      series: traverse_obj(product, ['collection', 'title']) != null
        ? String(traverse_obj(product, ['collection', 'title']))
        : undefined,
      age_limit: parse_age_limit(traverse_obj(product, ['rating', 'name'])) ?? undefined,
    };
  }
}

export class TV5UnisVideoIE extends TV5UnisBaseIE {
  static IE_NAME = 'tv5unis:video';
  static _VALID_URL = /https?:\/\/(?:www\.)?tv5unis\.ca\/videos\/[^/?#]+\/(?<id>\d+)/;
  protected static _GQL_QUERY_NAME = 'productById';
  protected static _gqlArgs(groups: Record<string, string | undefined>): string {
    return `id: ${groups.id}`;
  }
}

export class TV5UnisIE extends TV5UnisBaseIE {
  static IE_NAME = 'tv5unis';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?tv5unis\.ca\/videos\/(?<id>[^/?#]+)(?:\/saisons\/(?<season_number>\d+)\/episodes\/(?<episode_number>\d+))?\/?(?:[?#&]|$)/;
  protected static _GQL_QUERY_NAME = 'productByRootProductSlug';
  protected static _gqlArgs(groups: Record<string, string | undefined>): string {
    let args = `rootProductSlug: "${groups.id}"`;
    if (groups.season_number) {
      args += `, seasonNumber: ${groups.season_number}, episodeNumber: ${groups.episode_number}`;
    }
    return args;
  }
}

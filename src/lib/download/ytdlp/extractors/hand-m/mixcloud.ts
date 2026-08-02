/**
 * MixcloudBaseIE / MixcloudIE / MixcloudUserIE / MixcloudPlaylistIE — ported from yt-dlp mixcloud.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  str_or_none,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, extractMpdFormatsAndSubtitles, parseIso8601 } from './_helpers';

const DECRYPTION_KEY = 'IFYOUWANTTHEARTISTSTOGETPAIDDONOTDOWNLOADFROMMIXCLOUD';

function decryptXorCipher(key: string, ciphertext: string): string {
  const out: string[] = [];
  for (let i = 0; i < ciphertext.length; i++) {
    out.push(String.fromCharCode(ciphertext.charCodeAt(i) ^ key.charCodeAt(i % key.length)));
  }
  return out.join('');
}

function decodeMixcloudUrl(encoded: string): string {
  const binary = atob(encoded);
  return decryptXorCipher(DECRYPTION_KEY, binary);
}

export class MixcloudBaseIE extends InfoExtractor {
  static IE_NAME = 'mixcloudbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('MixcloudBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(
    objectType: string,
    objectFields: string,
    displayId: string,
    username: string,
    slug?: string | null,
  ): Promise<Record<string, unknown>> {
    const lookupKey = `${objectType}Lookup`;
    const slugPart = slug ? `, slug: "${slug}"` : '';
    const query = `{ ${lookupKey}(lookup: {username: "${username}"${slugPart}}) { ${objectFields} } }`;
    const resp = await this._download_json<{ data: Record<string, Record<string, unknown>> }>(
      'https://app.mixcloud.com/graphql',
      displayId,
      undefined,
      { query: { query } },
    );
    return resp.data?.[lookupKey] || {};
  }
}

export class MixcloudIE extends MixcloudBaseIE {
  static IE_NAME = 'mixcloud';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|beta|m)\.)?mixcloud\.com\/(?<username>[^/]+)\/(?!stream|uploads|favorites|listens|playlists)(?<slug>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let username = decodeURIComponent(m.groups?.username ?? '');
    let slug = decodeURIComponent(m.groups?.slug ?? '');
    const trackId = `${username}_${slug}`;

    const cloudcast = await this._callApi(
      'cloudcast',
      `audioLength
    comments(first: 100) { edges { node { comment created user { displayName username } } } totalCount }
    description favorites { totalCount } featuringArtistList isExclusive name
    owner { displayName url username }
    picture(width: 1024, height: 1024) { url }
    plays publishDate reposts { totalCount }
    streamInfo { dashUrl hlsUrl url }
    tags { tag { name } }
    restrictedReason id`,
      trackId,
      username,
      slug,
    );

    if (!cloudcast || !Object.keys(cloudcast).length) {
      throw new ExtractorError('Track not found', { expected: true });
    }

    const reason = str_or_none(cloudcast.restrictedReason);
    if (reason === 'tracklist') {
      throw new ExtractorError('Track unavailable in your country due to licensing restrictions', {
        expected: true,
      });
    }
    if (reason === 'repeat_play') {
      throw new ExtractorError('You have reached your play limit for this track', { expected: true });
    }
    if (reason) throw new ExtractorError('Track is restricted', { expected: true });

    const streamInfo = (cloudcast.streamInfo as Record<string, unknown>) || {};
    const formats: Format[] = [];

    for (const urlKey of ['url', 'hlsUrl', 'dashUrl'] as const) {
      const encoded = str_or_none(streamInfo[urlKey]);
      if (!encoded) continue;
      const decrypted = decodeMixcloudUrl(encoded);
      if (urlKey === 'hlsUrl') {
        const res = await extractM3u8FormatsAndSubtitles(this, decrypted, trackId, 'hls');
        formats.push(...res.formats);
      } else if (urlKey === 'dashUrl') {
        const res = await extractMpdFormatsAndSubtitles(this, decrypted, trackId, 'dash');
        formats.push(...res.formats);
      } else {
        formats.push({
          format_id: 'http',
          url: decrypted,
          vcodec: 'none',
        });
      }
    }

    if (!formats.length && cloudcast.isExclusive) {
      this.raise_login_required(undefined, true);
    }

    const owner = (cloudcast.owner as Record<string, unknown>) || {};
    const tags = ((cloudcast.tags as Array<{ tag?: { name?: string } }>) || [])
      .map((t) => t.tag?.name)
      .filter(Boolean) as string[];

    return {
      id: trackId,
      formats,
      title: str_or_none(cloudcast.name) ?? undefined,
      description: str_or_none(cloudcast.description) ?? undefined,
      thumbnail: url_or_none((cloudcast.picture as Record<string, unknown>)?.url) ?? undefined,
      timestamp: parseIso8601(cloudcast.publishDate) ?? undefined,
      duration: int_or_none(cloudcast.audioLength) ?? undefined,
      uploader: str_or_none(owner.displayName) ?? undefined,
      uploader_id: str_or_none(owner.username) ?? undefined,
      uploader_url: url_or_none(owner.url) ?? undefined,
      view_count: int_or_none(cloudcast.plays) ?? undefined,
      like_count: int_or_none((cloudcast.favorites as Record<string, unknown>)?.totalCount) ?? undefined,
      repost_count: int_or_none((cloudcast.reposts as Record<string, unknown>)?.totalCount) ?? undefined,
      comment_count: int_or_none((cloudcast.comments as Record<string, unknown>)?.totalCount) ?? undefined,
      tags,
      artists: ((cloudcast.featuringArtistList as string[]) || []).filter(Boolean),
    };
  }
}

abstract class MixcloudPlaylistBaseIE extends MixcloudBaseIE {
  protected abstract readonly _TITLE_KEY: string;
  protected abstract readonly _DESCRIPTION_KEY: string;
  protected abstract readonly _ROOT_TYPE: string;
  protected abstract readonly _NODE_TEMPLATE: string;

  protected _getCloudcast(node: Record<string, unknown>): Record<string, unknown> {
    return node;
  }

  protected _getPlaylistTitle(title: string, _slug: string): string {
    return title;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let username = decodeURIComponent(m.groups?.username ?? m.groups?.user ?? '');
    let slug = decodeURIComponent(m.groups?.slug ?? m.groups?.playlist ?? m.groups?.type ?? '');
    if (!slug) slug = 'uploads';
    const playlistId = `${username}_${slug}`;
    const isPlaylistType = this._ROOT_TYPE === 'playlist';
    const playlistType = isPlaylistType ? 'items' : slug;

    const entries: VideoInfo[] = [];
    let listFilter = '';
    let hasNextPage = true;
    let playlist: Record<string, unknown> = {};

    while (hasNextPage) {
      playlist = await this._callApi(
        this._ROOT_TYPE,
        `${this._TITLE_KEY}
    ${this._DESCRIPTION_KEY}
    ${playlistType}(first: 100${listFilter}) {
      edges { node { ${this._NODE_TEMPLATE} } }
      pageInfo { endCursor hasNextPage }
    }`,
        playlistId,
        username,
        isPlaylistType ? slug : null,
      );

      const items = (playlist[playlistType] as Record<string, unknown>) || {};
      for (const edge of (items.edges as Array<{ node?: Record<string, unknown> }>) || []) {
        const cloudcast = this._getCloudcast(edge.node || {});
        const cloudcastUrl = str_or_none(cloudcast.url);
        if (!cloudcastUrl) continue;
        const itemSlug = str_or_none(cloudcast.slug);
        const ownerUsername = str_or_none((cloudcast.owner as Record<string, unknown>)?.username);
        const videoId = itemSlug && ownerUsername ? `${ownerUsername}_${itemSlug}` : undefined;
        entries.push(this.url_result(cloudcastUrl, 'mixcloud', videoId));
      }

      const pageInfo = (items.pageInfo as Record<string, unknown>) || {};
      hasNextPage = !!pageInfo.hasNextPage;
      listFilter = pageInfo.endCursor ? `, after: "${pageInfo.endCursor}"` : '';
    }

    return this.playlist_result(
      entries,
      playlistId,
      this._getPlaylistTitle(String(playlist[this._TITLE_KEY] ?? ''), slug),
      str_or_none(playlist[this._DESCRIPTION_KEY]) ?? undefined,
    );
  }
}

export class MixcloudUserIE extends MixcloudPlaylistBaseIE {
  static IE_NAME = 'mixcloud:user';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?mixcloud\.com\/(?<username>[^/]+)\/(?<type>uploads|favorites|listens|stream)?\/?$/;
  protected readonly _TITLE_KEY = 'displayName';
  protected readonly _DESCRIPTION_KEY = 'biog';
  protected readonly _ROOT_TYPE = 'user';
  protected readonly _NODE_TEMPLATE = 'slug url owner { username }';

  protected _getPlaylistTitle(title: string, slug: string): string {
    return `${title} (${slug})`;
  }
}

export class MixcloudPlaylistIE extends MixcloudPlaylistBaseIE {
  static IE_NAME = 'mixcloud:playlist';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?mixcloud\.com\/(?<user>[^/]+)\/playlists\/(?<playlist>[^/]+)\/?$/;
  protected readonly _TITLE_KEY = 'name';
  protected readonly _DESCRIPTION_KEY = 'description';
  protected readonly _ROOT_TYPE = 'playlist';
  protected readonly _NODE_TEMPLATE = 'cloudcast { slug url owner { username } }';

  protected _getCloudcast(node: Record<string, unknown>): Record<string, unknown> {
    return (node.cloudcast as Record<string, unknown>) || {};
  }
}

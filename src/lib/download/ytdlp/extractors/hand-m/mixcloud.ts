// @ts-nocheck
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
import { parseIso8601 } from './_helpers';

const DECRYPTION_KEY = 'IFYOUWANTTHEARTISTSTOGETPAIDDONOTDOWNLOADFROMMIXCLOUD';

/** Encrypt/Decrypt XOR cipher (yt-dlp `_decrypt_xor_cipher`). */
function decryptXorCipher(key: string, ciphertext: string): string {
  const out: string[] = [];
  for (let i = 0; i < ciphertext.length; i++) {
    out.push(String.fromCharCode(ciphertext.charCodeAt(i) ^ key.charCodeAt(i % key.length)));
  }
  return out.join('');
}

/** base64 → XOR → stream URL（对齐 Python `base64.b64decode` + XOR）。 */
function decodeMixcloudUrl(encoded: string): string {
  const cleaned = String(encoded)
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const pad = (4 - (cleaned.length % 4)) % 4;
  const padded = cleaned + '='.repeat(pad);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new ExtractorError('Failed to decode Mixcloud stream URL', { expected: true });
  }
  return decryptXorCipher(DECRYPTION_KEY, binary);
}

/** youtube-dl MixcloudIE：解密结果必须是干净 CDN URL，否则跳过该路。 */
const DECRYPTED_URL_RE = /^https?:\/\/[0-9a-z.]+\/[0-9A-Za-z/.?=&_-]+$/;

function markMixcloudAudio(f: Format, preference?: number): Format {
  f.vcodec = 'none';
  f.video_ext = 'none';
  // 勿把 acodec 置 null：format-selector/categories 只认显式音频编码
  if (!f.acodec || f.acodec === 'none') f.acodec = 'aac';
  if (!f.audio_ext || f.audio_ext === 'none') f.audio_ext = 'm4a';
  if (!f.ext || f.ext === 'mp4' || f.ext === 'unknown') f.ext = 'm4a';
  if (preference != null) f.preference = preference;
  return f;
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
    const query = `{
  ${lookupKey}(lookup: {username: "${username}"${slugPart}}) {
    ${objectFields}
  }
}`;
    // 浏览器同款 POST JSON（巨型 GET query 易失败）；impersonate 可选，普通 TLS 实测可用
    const resp = await this._download_json<{
      data?: Record<string, Record<string, unknown> | null>;
      errors?: Array<{ message?: string }>;
    }>('https://app.mixcloud.com/graphql', displayId, 'Downloading GraphQL metadata', {
      method: 'POST',
      data: JSON.stringify({ query }),
      impersonate: true,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: 'https://www.mixcloud.com',
        Referer: 'https://www.mixcloud.com/',
      },
    });
    const obj = resp.data?.[lookupKey];
    if (obj == null) {
      const msg = resp.errors?.[0]?.message;
      if (msg) throw new ExtractorError(msg, { expected: true });
      return {};
    }
    return obj;
  }
}

export class MixcloudIE extends MixcloudBaseIE {
  static IE_NAME = 'mixcloud';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|beta|m)\.)?mixcloud\.com\/(?<username>[^/]+)\/(?!stream|uploads|favorites|listens|playlists)(?<slug>[^/#?]+)\/?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const username = decodeURIComponent(m.groups?.username ?? '').replace(/\/+$/, '');
    const slug = decodeURIComponent(m.groups?.slug ?? '').replace(/\/+$/, '');
    const trackId = `${username}_${slug}`;

    const cloudcast = await this._callApi(
      'cloudcast',
      `audioLength
    comments(first: 100) {
      edges {
        node {
          comment
          created
          user {
            displayName
            username
          }
        }
      }
      totalCount
    }
    description
    favorites { totalCount }
    featuringArtistList
    isExclusive
    name
    owner {
      displayName
      url
      username
    }
    picture(width: 1024, height: 1024) { url }
    plays
    publishDate
    reposts { totalCount }
    streamInfo {
      dashUrl
      hlsUrl
      url
    }
    tags { tag { name } }
    restrictedReason
    id`,
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
    const streamHeaders = {
      Referer: 'https://www.mixcloud.com/',
      Origin: 'https://www.mixcloud.com',
      // CDN 大文件 gzip 易解码失败；身份编码更稳
      'Accept-Encoding': 'identity',
    };

    // 顺序对齐 yt-dlp：url → hls → dash；preference 仍抬高 HLS，避开易 503 的 progressive
    for (const urlKey of ['url', 'hlsUrl', 'dashUrl'] as const) {
      const encoded = str_or_none(streamInfo[urlKey]);
      if (!encoded) continue;
      let decrypted: string;
      try {
        decrypted = decodeMixcloudUrl(encoded);
      } catch (e) {
        this.report_warning(`${trackId}: ${urlKey} decrypt failed: ${(e as Error).message || e}`);
        continue;
      }
      if (!DECRYPTED_URL_RE.test(decrypted)) {
        this.report_warning(`${trackId}: ${urlKey} decrypted to invalid URL`);
        continue;
      }

      if (urlKey === 'hlsUrl') {
        try {
          const res = await this._extract_m3u8_formats_and_subtitles(
            decrypted,
            trackId,
            'm4a',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
            { headers: streamHeaders },
          );
          for (const f of res.formats) {
            markMixcloudAudio(f, 10);
            f.http_headers = { ...(f.http_headers || {}), ...streamHeaders };
            formats.push(f);
          }
        } catch (e) {
          this.report_warning(`${trackId}: HLS extract failed: ${(e as Error).message || e}`);
        }
      } else if (urlKey === 'dashUrl') {
        try {
          const res = await this._extract_mpd_formats_and_subtitles(
            decrypted,
            trackId,
            'dash',
            undefined,
            false,
            { headers: streamHeaders },
          );
          for (const f of res.formats) {
            markMixcloudAudio(f, 5);
            f.http_headers = { ...(f.http_headers || {}), ...streamHeaders };
            formats.push(f);
          }
        } catch (e) {
          this.report_warning(`${trackId}: DASH extract failed: ${(e as Error).message || e}`);
        }
      } else {
        formats.push(
          markMixcloudAudio(
            {
              format_id: 'http',
              url: decrypted,
              ext: 'm4a',
              protocol: 'https',
              // 低于 HLS，避免默认选中易 503 的 progressive
              preference: -10,
              http_headers: { ...streamHeaders },
              // Mixcloud starts throttling at >~5M (yt-dlp) — 配合引擎单连接
              downloader_options: { http_chunk_size: 5242880 },
            },
            -10,
          ),
        );
      }
    }

    if (!formats.length && cloudcast.isExclusive) {
      this.raise_login_required(undefined, true);
    }
    if (!formats.length) {
      this.raise_no_formats('No audio formats found', true);
    }

    const owner = (cloudcast.owner as Record<string, unknown>) || {};
    const tags = ((cloudcast.tags as Array<{ tag?: { name?: string } }>) || [])
      .map((t) => t.tag?.name)
      .filter(Boolean) as string[];

    const comments: Array<Record<string, unknown>> = [];
    for (const edge of ((cloudcast.comments as { edges?: Array<{ node?: Record<string, unknown> }> })?.edges ||
      [])) {
      const node = edge.node || {};
      const text = str_or_none(node.comment)?.trim();
      if (!text) continue;
      const user = (node.user as Record<string, unknown>) || {};
      comments.push({
        text,
        author: str_or_none(user.displayName) ?? undefined,
        author_id: str_or_none(user.username) ?? undefined,
        timestamp: parseIso8601(node.created) ?? undefined,
      });
    }

    return {
      id: trackId,
      formats,
      comments: comments as VideoInfo['comments'],
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
      http_headers: streamHeaders,
      // 透传到下载引擎；Mixcloud HTTP 流 >~5M 会限速 → 引擎侧强制单连接
      __downloader_options: { http_chunk_size: 5242880 },
    };
  }
}

export abstract class MixcloudPlaylistBaseIE extends MixcloudBaseIE {
  static IE_NAME = 'mixcloud:playlistbase';
  static _VALID_URL = false as const;
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

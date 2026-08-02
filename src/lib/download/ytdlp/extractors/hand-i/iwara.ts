/**
 * IwaraBaseIE / IwaraIE / IwaraUserIE / IwaraPlaylistIE — ported from yt-dlp iwara.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  mimetype2ext,
  str_or_none,
  traverse_obj,
  unified_timestamp,
} from '../../utils';
import { jwtDecodePayload, protoRelative } from './_helpers';

async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const FORMAT_PREFERENCE = ['preview', '360', '540', 'Source'];

function formatPreference(name: string): number {
  const idx = FORMAT_PREFERENCE.indexOf(name);
  return idx >= 0 ? idx : -1;
}

export class IwaraBaseIE extends InfoExtractor {
  static IE_NAME = 'iwarabase';
  static _NETRC_MACHINE = 'iwara';
  static _VALID_URL: RegExp | string | false | null = false;

  protected static _USERTOKEN: string | null = null;
  protected static _MEDIATOKEN: string | null = null;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('IwaraBaseIE is not a standalone extractor', { expected: true });
  }

  protected _isTokenExpired(token: string, tokenType: string): boolean {
    const exp = (jwtDecodePayload(token).exp as number | undefined) || 0;
    if (exp <= Math.floor(Date.now() / 1000) - 120) {
      this.to_screen(`${tokenType} token has expired`);
      return true;
    }
    return false;
  }

  protected async _callApi(
    path: string,
    videoId: string | undefined,
    opts: {
      method?: string;
      headers?: Record<string, string>;
      data?: string;
      query?: Record<string, string>;
    } = {},
  ): Promise<Record<string, unknown>> {
    return (
      (await this._download_json<Record<string, unknown>>(`https://api.iwara.tv/${path}`, videoId, undefined, {
        ...opts,
      })) || {}
    );
  }

  protected _getCredentials(): [string | undefined, string | undefined] {
    const ie = this as InfoExtractor & { _get_login_info?: () => [string?, string?] };
    const creds = ie._get_login_info?.() || [undefined, undefined];
    return [creds[0], creds[1]];
  }

  protected async _getUserToken(): Promise<void> {
    const [username, password] = this._getCredentials();
    if (!username || !password) return;

    let userToken = IwaraBaseIE._USERTOKEN;
    if (!userToken || this._isTokenExpired(userToken, 'User')) {
      const response = await this._callApi('user/login', undefined, {
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ email: username, password }),
      });
      userToken = str_or_none(response.token) ?? null;
      if (!userToken) {
        const error = str_or_none(response.message) ?? undefined;
        if (error?.includes('invalidLogin')) {
          throw new ExtractorError('Invalid login credentials', { expected: true });
        }
        throw new ExtractorError(`Iwara API said: ${error || 'nothing'}`, { expected: true });
      }
    }
    IwaraBaseIE._USERTOKEN = userToken!;
  }

  protected async _getMediaToken(): Promise<Record<string, string> | undefined> {
    await this._getUserToken();
    if (!IwaraBaseIE._USERTOKEN) return undefined;

    if (!IwaraBaseIE._MEDIATOKEN || this._isTokenExpired(IwaraBaseIE._MEDIATOKEN, 'Media')) {
      const resp = await this._callApi('user/token', undefined, {
        data: '',
        headers: {
          Authorization: `Bearer ${IwaraBaseIE._USERTOKEN}`,
          'Content-Type': 'application/json',
        },
      });
      IwaraBaseIE._MEDIATOKEN = String(resp.accessToken ?? '');
    }
    return { Authorization: `Bearer ${IwaraBaseIE._MEDIATOKEN}` };
  }

  protected async _perform_login(_username: string, _password: string): Promise<void> {
    await this._getMediaToken();
  }
}

export class IwaraIE extends IwaraBaseIE {
  static IE_NAME = 'iwara';
  static _VALID_URL = /https?:\/\/(?:www\.|ecchi\.)?iwara\.tv\/videos?\/(?<id>[a-zA-Z0-9]+)/;

  protected async _extractFormats(videoId: string, fileUrl: string): Promise<Format[]> {
    const up = new URL(fileUrl);
    const q = Object.fromEntries(up.searchParams.entries());
    const paths = up.pathname.replace(/\/$/, '').split('/');
    const xVersion = await sha1Hex(
      `${paths[paths.length - 1]}_${q.expires ?? ''}_mSvL05GfEmeEmsEYfGCnVpEjYgTJraJN`,
    );

    const files = await this._download_json<Array<Record<string, unknown>>>(fileUrl, videoId, undefined, {
      headers: { 'X-Version': xVersion },
    });

    const formats: Format[] = [];
    for (const fmt of files || []) {
      const src =
        protoRelative(String(traverse_obj(fmt, ['src', 'view']) || traverse_obj(fmt, ['src', 'download']) || ''));
      if (!src) continue;
      formats.push({
        format_id: fmt.name != null ? String(fmt.name) : `source-${formats.length}`,
        url: String(src),
        ext: mimetype2ext(fmt.type != null ? String(fmt.type) : null) || undefined,
        quality: formatPreference(fmt.name != null ? String(fmt.name) : ''),
        height: int_or_none(fmt.name) ?? undefined,
      });
    }
    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const [username] = this._getCredentials();
    const videoData = await this._callApi(`video/${videoId}`, videoId, {
      headers: await this._getMediaToken(),
    });

    const errmsg = videoData.message != null ? String(videoData.message) : undefined;
    if (errmsg === 'errors.privateVideo') {
      this.raise_login_required('Private video. Login if you have permissions to watch', 'password');
    }
    if (errmsg === 'errors.notFound' && !username) {
      this.raise_login_required('Video may need login to view', 'password');
    }
    if (errmsg) {
      throw new ExtractorError(`Iwara says: ${errmsg}`, { expected: true });
    }

    if (!videoData.fileUrl) {
      if (videoData.embedUrl) {
        return this.url_result(String(videoData.embedUrl));
      }
      throw new ExtractorError('This video is unplayable', { expected: true });
    }

    return {
      id: videoId,
      age_limit: videoData.rating === 'ecchi' ? 18 : 0,
      title: traverse_obj(videoData, ['title']) as string | undefined,
      description: traverse_obj(videoData, ['body']) as string | undefined,
      uploader: traverse_obj(videoData, ['user', 'name']) as string | undefined,
      uploader_id: traverse_obj(videoData, ['user', 'username']) as string | undefined,
      tags: ((videoData.tags as Array<Record<string, unknown>>) || [])
        .map((t) => (t.id != null ? String(t.id) : ''))
        .filter(Boolean),
      like_count: int_or_none(videoData.numLikes) ?? undefined,
      view_count: int_or_none(videoData.numViews) ?? undefined,
      comment_count: int_or_none(videoData.numComments) ?? undefined,
      timestamp: unified_timestamp(traverse_obj(videoData, ['createdAt'])) ?? undefined,
      modified_timestamp: unified_timestamp(traverse_obj(videoData, ['updatedAt'])) ?? undefined,
      thumbnail: (() => {
        const fileId = str_or_none(traverse_obj(videoData, ['file', 'id']));
        return fileId ? `https://files.iwara.tv/image/thumbnail/${fileId}/thumbnail-00.jpg` : undefined;
      })(),
      formats: await this._extractFormats(videoId, String(videoData.fileUrl)),
    };
  }
}

export class IwaraUserIE extends IwaraBaseIE {
  static IE_NAME = 'iwara:user';
  static _VALID_URL = /https?:\/\/(?:www\.)?iwara\.tv\/profile\/(?<id>[^/?#&]+)/;
  protected _PER_PAGE = 32;

  protected async _fetchEntries(playlistId: string, userId: string, page: number): Promise<VideoInfo[]> {
    const videos = await this._callApi('videos', playlistId, {
      query: {
        page: String(page),
        sort: 'date',
        user: userId,
        limit: String(this._PER_PAGE),
      },
      headers: await this._getMediaToken(),
    });
    const ids = ((videos.results as Array<Record<string, unknown>>) || [])
      .map((r) => (r.id != null ? String(r.id) : ''))
      .filter(Boolean);
    return ids.map((id) => this.url_result(`https://iwara.tv/video/${id}`));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const userInfo = await this._callApi(`profile/${playlistId}`, playlistId, {
      headers: await this._getMediaToken(),
    });
    const userId = String(traverse_obj(userInfo, ['user', 'id']) ?? '');

    const entries: VideoInfo[] = [];
    for (let page = 1; ; page++) {
      const batch = await this._fetchEntries(playlistId, userId, page);
      entries.push(...batch);
      if (batch.length < this._PER_PAGE) break;
    }

    return this.playlist_result(
      entries,
      playlistId,
      traverse_obj(userInfo, ['user', 'name']) as string | undefined,
    );
  }
}

export class IwaraPlaylistIE extends IwaraBaseIE {
  static IE_NAME = 'iwara:playlist';
  static _VALID_URL = /https?:\/\/(?:www\.)?iwara\.tv\/playlist\/(?<id>[0-9a-f-]+)/;
  protected _PER_PAGE = 32;

  protected async _fetchEntries(
    playlistId: string,
    firstPage: Record<string, unknown> | null,
    page: number,
  ): Promise<VideoInfo[]> {
    const videos =
      page === 0
        ? firstPage
        : await this._callApi('videos', playlistId, {
            query: { page: String(page), limit: String(this._PER_PAGE) },
            headers: await this._getMediaToken(),
          });
    const ids = ((videos?.results as Array<Record<string, unknown>>) || [])
      .map((r) => (r.id != null ? String(r.id) : ''))
      .filter(Boolean);
    return ids.map((id) => this.url_result(`https://iwara.tv/video/${id}`));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const page0 = await this._callApi(`playlist/${playlistId}`, playlistId, {
      query: { page: '0', limit: String(this._PER_PAGE) },
      headers: await this._getMediaToken(),
    });

    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      const batch = await this._fetchEntries(playlistId, page === 0 ? page0 : null, page);
      entries.push(...batch);
      if (batch.length < this._PER_PAGE) break;
    }

    return this.playlist_result(
      entries,
      playlistId,
      traverse_obj(page0, ['title', 'name']) as string | undefined,
    );
  }
}

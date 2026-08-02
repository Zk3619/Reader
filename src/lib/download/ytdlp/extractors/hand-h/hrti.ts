/**
 * HRTiBaseIE / HRTiIE / HRTiPlaylistIE — ported from yt-dlp hrti.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, try_get } from '../../utils';

function parseAgeLimit(rating: unknown): number | undefined {
  const n = int_or_none(rating);
  return n ?? undefined;
}

export class HRTiBaseIE extends InfoExtractor {
  static IE_NAME = 'hrtibase';
  static _NETRC_MACHINE = 'hrti';
  static _VALID_URL: RegExp | string | false | null = false;

  protected _APP_LANGUAGE = 'hr';
  protected _APP_VERSION = '1.1';
  protected _APP_PUBLICATION_ID = 'all_in_one';
  protected _API_URL = 'http://clientapi.hrt.hr/client_api.php/config/identify/format/json';
  protected _token: string | null = null;
  protected _sessionId = '';
  protected _searchUrl = '';
  protected _loginUrl = '';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('HRTiBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _initializePreLogin(): Promise<void> {
    const initData = { application_publication_id: this._APP_PUBLICATION_ID };
    const initRes = await this._download_json<{ uuid?: string }>(
      this._API_URL,
      undefined,
      'Downloading uuid',
      { data: JSON.stringify(initData), method: 'POST' },
    );
    const appData = {
      uuid: initRes.uuid,
      application_publication_id: this._APP_PUBLICATION_ID,
      application_version: this._APP_VERSION,
    };
    const resources = await this._download_json<Record<string, unknown>>(
      this._API_URL,
      undefined,
      'Downloading session information',
      { data: JSON.stringify(appData), method: 'PUT' },
    );
    this._sessionId = String(resources.session_id ?? '');
    const modules = (resources.modules as Record<string, Record<string, unknown>>) || {};
    const vodCatalog = (modules.vod_catalog as Record<string, unknown>) || {};
    const resourcesBlock = (vodCatalog.resources as Record<string, Record<string, unknown>>) || {};
    const search = (resourcesBlock.search as Record<string, unknown>) || {};
    this._searchUrl = String(search.uri ?? '').replace('{language}', this._APP_LANGUAGE).replace('{application_id}', this._APP_PUBLICATION_ID);
    const user = (modules.user as Record<string, unknown>) || {};
    const userResources = (user.resources as Record<string, Record<string, unknown>>) || {};
    const login = (userResources.login as Record<string, unknown>) || {};
    this._loginUrl = `${String(login.uri ?? '')}/format/json`.replace('{session_id}', this._sessionId);
  }

  protected async _perform_login(username: string, password: string): Promise<void> {
    const authData = { username, password };
    let authInfo: Record<string, unknown>;
    try {
      authInfo = await this._download_json<Record<string, unknown>>(this._loginUrl, undefined, 'Logging in', {
        data: JSON.stringify(authData),
        method: 'POST',
      });
    } catch (e) {
      const cause = (e as { cause?: { status?: number; body?: string } }).cause;
      if (cause?.status === 406 && cause.body) {
        authInfo = this._parse_json<Record<string, unknown>>(cause.body, undefined) ?? {};
      } else {
        throw e;
      }
    }
    const errorMessage = ((authInfo.error as Record<string, unknown>) || {}).message;
    if (errorMessage) {
      throw new ExtractorError(`${this.IE_NAME} said: ${errorMessage}`, { expected: true });
    }
    this._token = String(authInfo.secure_streaming_token ?? '');
  }

  protected async _realInitialize(): Promise<void> {
    if (!this._searchUrl) await this._initializePreLogin();
    if (!this._token) this.raise_login_required(undefined, undefined, 'password');
  }
}

export class HRTiIE extends HRTiBaseIE {
  static IE_NAME = 'hrti';
  static _VALID_URL =
    /(?:hrti:(?<short_id>[0-9]+)|https?:\/\/hrti\.hrt\.hr\/(?:#\/)?video\/show\/(?<id>[0-9]+)\/(?<display_id>[^/]+)?)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._realInitialize();
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.short_id || m.groups!.id!;
    const displayId = m.groups!.display_id || videoId;

    const videoRes = await this._download_json<{ video?: Array<Record<string, unknown>> }>(
      `${this._searchUrl}/video_id/${videoId}/format/json`,
      displayId,
      'Downloading video metadata JSON',
    );
    const video = videoRes.video?.[0] || {};
    const titleInfo = (video.title as Record<string, unknown>) || {};
    const title = String(titleInfo.title_long ?? displayId);
    const movie = ((video.video_assets as Record<string, unknown>)?.movie as Array<Record<string, unknown>>)?.[0] || {};
    const m3u8Url = String(movie.url ?? '').replace('{TOKEN}', this._token || '');
    const formats = await this._extract_m3u8_formats(m3u8Url, displayId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');

    return {
      id: videoId,
      display_id: displayId,
      title,
      description: clean_html(titleInfo.summary_long as string | undefined) ?? undefined,
      duration: int_or_none(movie.duration) ?? undefined,
      view_count: int_or_none(video.views) ?? undefined,
      average_rating: int_or_none(video.user_rating) ?? undefined,
      age_limit: parseAgeLimit((video.parental_control as Record<string, unknown> | undefined)?.rating),
      formats,
    };
  }
}

export class HRTiPlaylistIE extends HRTiBaseIE {
  static IE_NAME = 'hrtiplaylist';
  static _VALID_URL =
    /https?:\/\/hrti\.hrt\.hr\/(?:#\/)?video\/list\/category\/(?<id>[0-9]+)\/(?<display_id>[^/]+)?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._realInitialize();
    const m = this._match_valid_url(url)!;
    const categoryId = m.groups!.id!;
    const displayId = m.groups!.display_id || categoryId;

    const response = await this._download_json<Record<string, unknown>>(
      `${this._searchUrl}/category_id/${categoryId}/format/json`,
      displayId,
      'Downloading video metadata JSON',
    );

    const listingIds = try_get(
      response,
      (x) => (x.video_listings as Array<Record<string, unknown>>)[0]?.alternatives as Array<Record<string, unknown>>,
      Array.isArray,
    ) as Array<Record<string, unknown>> | null;
    const list = try_get(listingIds?.[0], (x) => x.list, Array.isArray) as unknown[] | null;
    const videoIds =
      list?.map(String) ||
      ((response.videos as Array<Record<string, unknown>>) || [])
        .map((v) => v.id)
        .filter(Boolean)
        .map(String);

    const entries = videoIds.map((id) => this.url_result(`hrti:${id}`, 'HRTi', id));
    return this.playlist_result(entries, categoryId, displayId);
  }
}

/**
 * LaXarxaMesIE — ported from yt-dlp laxarxames.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, traverse_obj } from '../../utils';

export class LaXarxaMesIE extends InfoExtractor {
  static IE_NAME = 'laxarxames';
  static _NETRC_MACHINE = 'laxarxames';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?laxarxames\.cat\/(?:[^/?#]+\/)*?(?:player|movie-details)\/(?<id>\d+)/;

  private static _token: string | null = null;

  protected async _performLogin(username: string, password: string): Promise<void> {
    if (LaXarxaMesIE._token) return;

    const login = await this._download_json<Record<string, unknown>>(
      'https://api.laxarxames.cat/Authorization/SignIn',
      undefined,
      'Logging in',
      {
        method: 'POST',
        headers: {
          'X-Tenantorigin': 'https://laxarxames.cat',
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({
          Username: username,
          Password: password,
          Device: { PlatformCode: 'WEB', Name: 'Mac OS ()' },
        }),
      },
    );

    LaXarxaMesIE._token = str_or_none(traverse_obj(login, ['AuthorizationToken', 'Token']));
    if (!LaXarxaMesIE._token) {
      throw new ExtractorError('Login failed', { expected: true });
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    if (!LaXarxaMesIE._token) {
      this.raise_login_required();
    }

    const mediaPlayInfo = await this._download_json<Record<string, unknown>>(
      'https://api.laxarxames.cat/Media/GetMediaPlayInfo',
      videoId,
      undefined,
      {
        method: 'POST',
        data: JSON.stringify({ MediaId: Number(videoId), StreamType: 'MAIN' }),
        headers: {
          Authorization: `Bearer ${LaXarxaMesIE._token}`,
          'X-Tenantorigin': 'https://laxarxames.cat',
          'Content-Type': 'application/json',
        },
      },
    );

    const contentUrl = str_or_none(traverse_obj(mediaPlayInfo, ['ContentUrl']));
    if (!contentUrl) {
      this.raise_no_formats('No video found', true);
    }

    return this.url_result(
      `https://players.brightcove.net/5779379807001/default_default/index.html?videoId=${contentUrl}`,
      'BrightcoveNew',
      videoId,
      str_or_none(mediaPlayInfo.Title) ?? undefined,
    );
  }
}

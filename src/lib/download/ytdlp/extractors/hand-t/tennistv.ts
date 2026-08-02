/** TennisTVIE — ported from yt-dlp tennistv.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_qs, str_or_none, unified_timestamp } from '../../utils';
import { extractM3u8FormatsAndSubtitles, urlencodePostdata } from './_helpers';

function appendQuery(url: string, query: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
}

function randomUuidV4(): string {
  return crypto.randomUUID();
}

export class TennisTVIE extends InfoExtractor {
  static IE_NAME = 'tennistv';
  static _VALID_URL = /https?:\/\/(?:www\.)?tennistv\.com\/videos\/(?<id>[-a-z0-9]+)/;

  protected accessToken: string | null = null;
  protected refreshToken: string | null = null;

  protected readonly _PARTNER_ID = 3001482;
  protected readonly _FORMAT_URL =
    'https://open.http.mp.streamamg.com/p/{partner}/sp/{partner}00/playManifest/entryId/{entry}/format/applehttp/protocol/https/a.m3u8?ks={session}';
  protected readonly _AUTH_BASE_URL =
    'https://sso.tennistv.com/auth/realms/TennisTV/protocol/openid-connect';
  protected readonly _HEADERS = {
    origin: 'https://www.tennistv.com',
    referer: 'https://www.tennistv.com/',
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  protected async _perform_login(username: string, password: string): Promise<void> {
    const loginPage = await this._download_webpage(
      `${this._AUTH_BASE_URL}/auth`,
      undefined,
      'Downloading login page',
      {
        query: {
          client_id: 'tennis-tv-web',
          redirect_uri: 'https://tennistv.com',
          response_mode: 'fragment',
          response_type: 'code',
          scope: 'openid',
        },
      },
    );
    const postUrl = this._html_search_regex(
      /action=["']([^"']+?)["']\s+method=["']post["']/i,
      loginPage,
      'login POST url',
    );
    if (!postUrl) throw new ExtractorError('Login POST url not found', { expected: true });
    const tempHandle = await this._request_webpage(
      {
        url: postUrl,
        data: urlencodePostdata({
          username,
          password,
          submitAction: 'Log In',
        }),
        headers: this._HEADERS,
      },
      undefined,
      'Sending login data',
    );
    const tempPage = tempHandle?.text || '';
    if (tempPage.includes('Your username or password was incorrect')) {
      throw new ExtractorError('Your username or password was incorrect', { expected: true });
    }

    const handle = await this._request_webpage(
      appendQuery(`${this._AUTH_BASE_URL}/auth`, {
        client_id: 'tennis-tv-web',
        redirect_uri: 'https://www.tennistv.com/resources/v1.1.10/html/silent-check-sso.html',
        state: randomUuidV4(),
        response_mode: 'fragment',
        response_type: 'code',
        scope: 'openid',
        nonce: randomUuidV4(),
        prompt: 'none',
      }),
      undefined,
      'Logging in',
      { headers: this._HEADERS },
    );
    if (!handle) throw new ExtractorError('Login redirect failed', { expected: true });
    const code = parse_qs(handle.url).code?.slice(-1)[0];
    if (!code) throw new ExtractorError('Login code missing', { expected: true });

    await this.getToken(undefined, {
      code,
      grant_type: 'authorization_code',
      client_id: 'tennis-tv-web',
      redirect_uri: 'https://www.tennistv.com/resources/v1.1.10/html/silent-check-sso.html',
    });
  }

  protected async getToken(
    videoId: string | undefined,
    payload: Record<string, string>,
  ): Promise<void> {
    const res = await this._download_json<Record<string, unknown>>(
      `${this._AUTH_BASE_URL}/token`,
      videoId,
      'Fetching tokens',
      { headers: this._HEADERS, data: urlencodePostdata(payload) },
    );
    this.accessToken = str_or_none(res.access_token) || this.accessToken;
    this.refreshToken = str_or_none(res.refresh_token) || this.refreshToken;
  }

  async _real_initialize(): Promise<void> {
    if (this.accessToken && this.refreshToken) return;
    const cookies = this._get_cookies('https://www.tennistv.com/');
    if (!cookies.access_token || !cookies.refresh_token) {
      this.raise_login_required();
    }
    this.accessToken = cookies.access_token;
    this.refreshToken = cookies.refresh_token;
  }

  protected async _downloadSessionJson(
    videoId: string,
    entryId: string,
  ): Promise<Record<string, unknown>> {
    return this._download_json(
      `https://atppayments.streamamg.com/api/v1/session/ksession/?lang=en&apijwttoken=${this.accessToken}&entryId=${entryId}`,
      videoId,
      'Downloading ksession token',
      { headers: this._HEADERS },
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const entryId = this._search_regex(/data-entry-id=["']([^"']+)/, webpage, 'entryID');
    if (!entryId) throw new ExtractorError('entryID not found', { expected: true });

    let sessionJson = await this._downloadSessionJson(videoId, entryId);
    let kSession = str_or_none(sessionJson.KSession);
    if (!kSession) {
      await this.getToken(videoId, {
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken!,
        client_id: 'tennis-tv-web',
      });
      sessionJson = await this._downloadSessionJson(videoId, entryId);
      kSession = str_or_none(sessionJson.KSession);
      if (!kSession) {
        throw new ExtractorError('Failed to get KSession, possibly a premium video', { expected: true });
      }
    }

    if (sessionJson.ErrorMessage) {
      this.report_warning(String(sessionJson.ErrorMessage));
    }

    const manifestUrl = this._FORMAT_URL.replace('{partner}', String(this._PARTNER_ID))
      .replace('{entry}', entryId)
      .replace('{session}', kSession);
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, manifestUrl, videoId);

    const desc =
      this._html_search_regex(
        /<span itemprop="description" content=["']([^"']+)["']/,
        webpage,
        'description',
        undefined,
        false,
      ) ||
      this._og_search_description(webpage) ||
      undefined;

    return {
      id: videoId,
      title: this._og_search_title(webpage, false) || videoId,
      description: desc,
      thumbnail: `https://open.http.mp.streamamg.com/p/${this._PARTNER_ID}/sp/${this._PARTNER_ID}00/thumbnail/entry_id/${entryId}/version/100001/height/1920`,
      timestamp:
        unified_timestamp(
          this._html_search_regex(
            /<span itemprop="uploadDate" content=["']([^"']+)["']/,
            webpage,
            'upload time',
            undefined,
            false,
          ),
        ) ?? undefined,
      series:
        this._html_search_regex(/data-series\s*?=\s*?"(.*?)"/, webpage, 'series', undefined, false) ||
        undefined,
      season:
        this._html_search_regex(
          /data-tournament-city\s*?=\s*?"(.*?)"/,
          webpage,
          'season',
          undefined,
          false,
        ) || undefined,
      episode:
        this._html_search_regex(/data-round\s*?=\s*?"(.*?)"/, webpage, 'round', undefined, false) ||
        undefined,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
    };
  }
}

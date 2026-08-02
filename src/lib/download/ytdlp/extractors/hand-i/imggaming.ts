/**
 * ImgGamingBaseIE — ported from yt-dlp imggaming.py
 *
 * Concrete site IEs (e.g. UFCTVIE) extend this class and set `_REALM` + `_VALID_URL`.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, str_or_none, try_get } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class ImgGamingBaseIE extends InfoExtractor {
  static IE_NAME = 'imggamingbase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _VALID_URL_TEMPL =
    'https?://(?P<domain>%s)/(?P<type>live|playlist|video)/(?P<id>\\d+)(?:\\?.*?\\bplaylistId=(?P<playlist_id>\\d+))?';

  protected _API_BASE = 'https://dce-frontoffice.imggaming.com/api/v2/';
  protected _API_KEY = '857a1e5d-e35e-4fdf-805b-a87b6f8364bf';
  protected _HEADERS: Record<string, string> | null = null;
  protected _MANIFEST_HEADERS = { 'Accept-Encoding': 'identity' };
  protected _REALM: string | null = null;

  protected _initializePreLogin(): void {
    this._HEADERS = {
      Realm: `dce.${this._REALM}`,
      'x-api-key': this._API_KEY,
    };
  }

  protected async _performLogin(username: string, password: string): Promise<void> {
    if (!this._HEADERS) this._initializePreLogin();
    const pHeaders = { ...this._HEADERS!, 'Content-Type': 'application/json' };
    const login = await this._download_json<{ authorisationToken?: string }>(
      `${this._API_BASE}login`,
      undefined,
      'Logging in',
      {
        data: JSON.stringify({ id: username, secret: password }),
        headers: pHeaders,
      },
    );
    this._HEADERS!['Authorization'] = `Bearer ${login.authorisationToken ?? ''}`;
  }

  protected async _realInitialize(): Promise<void> {
    if (!this._HEADERS) this._initializePreLogin();
    if (!this._HEADERS?.Authorization) {
      this.raise_login_required(undefined, undefined, 'password');
    }
  }

  protected async _callApi(path: string, mediaId: string): Promise<Record<string, unknown>> {
    return this._download_json<Record<string, unknown>>(`${this._API_BASE}${path}${mediaId}`, mediaId, undefined, {
      headers: this._HEADERS || undefined,
    });
  }

  protected async _extractDveApiUrl(mediaId: string, mediaType: string): Promise<string> {
    const streamPath = mediaType === 'video' ? 'stream/vod/' : 'stream?eventId=';
    try {
      const response = await this._callApi(streamPath, mediaId);
      return String(response.playerUrlCallback ?? '');
    } catch (e) {
      const msg = (e as Error).message || '';
      if (/403/.test(msg)) {
        throw new ExtractorError('Access denied — login may be required', { expected: true });
      }
      throw e;
    }
  }

  protected _yesPlaylist(playlistId: string, mediaId: string): boolean {
    if (this.params.noplaylist) return false;
    void playlistId;
    void mediaId;
    return true;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._realInitialize();
    const m = this._match_valid_url(url)!;
    const domain = m.groups!.domain!;
    let mediaType = m.groups!.type!;
    let mediaId = m.groups!.id!;
    const playlistId = m.groups!.playlist_id;

    if (playlistId && this._yesPlaylist(playlistId, mediaId)) {
      mediaType = 'playlist';
      mediaId = playlistId;
    }

    if (mediaType === 'playlist') {
      const playlist = await this._callApi('vod/playlist/', mediaId);
      const vods = (try_get(playlist, (x: Record<string, unknown>) => (x.videos as Record<string, unknown>)?.vods) ||
        []) as Array<Record<string, unknown>>;
      const entries = vods
        .map((video) => str_or_none(video.id))
        .filter(Boolean)
        .map((videoId) => this.url_result(`https://${domain}/video/${videoId}`, this.ie_key, videoId!));
      return this.playlist_result(
        entries,
        mediaId,
        playlist.title as string | undefined,
        playlist.description as string | undefined,
      );
    }

    const dveApiUrl = await this._extractDveApiUrl(mediaId, mediaType);
    const videoData = await this._download_json<Record<string, unknown>>(dveApiUrl, mediaId);
    const isLive = mediaType === 'live';
    const title = isLive
      ? ((await this._callApi('event/', mediaId)).title as string | undefined)
      : (videoData.name as string | undefined);

    const formats: Format[] = [];
    for (const proto of ['hls', 'dash'] as const) {
      const mediaUrl =
        (videoData[`${proto}Url`] as string | undefined) ||
        ((videoData[proto] as Record<string, unknown>)?.url as string | undefined);
      if (!mediaUrl) continue;
      if (proto === 'hls') {
        const res = await extractM3u8FormatsAndSubtitles(this, mediaUrl, mediaId, 'hls');
        for (const f of res.formats) {
          f.http_headers = { ...this._MANIFEST_HEADERS, ...(f.http_headers || {}) };
        }
        formats.push(...res.formats);
      } else {
        formats.push(
          ...(await this._extract_mpd_formats(mediaUrl, mediaId, 'dash', undefined, false, {
            headers: this._MANIFEST_HEADERS,
          })),
        );
      }
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const subtitle of (videoData.subtitles as Array<Record<string, unknown>>) || []) {
      const subtitleUrl = subtitle.url as string | undefined;
      if (!subtitleUrl) continue;
      const lang = (subtitle.lang as string | undefined) || 'en_US';
      (subtitles[lang] ||= []).push({ url: subtitleUrl, ext: 'vtt' });
    }

    return {
      id: mediaId,
      title: title || mediaId,
      formats,
      thumbnail: videoData.thumbnailUrl as string | undefined,
      description: videoData.description as string | undefined,
      duration: int_or_none(videoData.duration) ?? undefined,
      tags: videoData.tags as string[] | undefined,
      is_live: isLive,
      subtitles,
    };
  }
}

/** SonyLIVIE / SonyLIVSeriesIE — ported from yt-dlp sonyliv.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, jwtDecodePayload } from './_helpers';

export class SonyLIVIE extends InfoExtractor {
  static IE_NAME = 'sonyliv';
  static _GEO_COUNTRIES = ['IN'];
  static _VALID_URL =
    /(?:sonyliv:|https?:\/\/(?:www\.)?sonyliv\.com\/(?:s(?:how|port)s\/[^/]+|movies|clip|trailer|music-videos)\/[^/?#&]+-)(?<id>\d+)/;
  static _LOGIN_HINT =
    'Use "--username <mobile_number>" to login using OTP or "--username token --password <auth_token>" to login using auth token.';
  static _NETRC_MACHINE = 'sonyliv';

  protected _HEADERS: Record<string, string> = {};

  protected _getDeviceId(): string {
    const template = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.split('');
    let e = Date.now();
    for (let i = 0; i < template.length; i++) {
      const c = template[i]!;
      let n = Math.trunc((e + 16 * Math.random()) % 16);
      e = Math.floor(e / 16);
      if (c === 'x') template[i] = String(n);
      else if (c === 'y') template[i] = ((3 & n) | 8).toString(16);
    }
    return `${template.join('')}-${Date.now()}`;
  }

  protected async _performLogin(username: string, password: string): Promise<void> {
    this._HEADERS.device_id = this._getDeviceId();
    this._HEADERS['content-type'] = 'application/json';

    try {
      jwtDecodePayload(password);
      if (username.toLowerCase() === 'token') {
        this._HEADERS.authorization = password;
        return;
      }
    } catch {
      /* not a jwt token */
    }

    if (username.length !== 10 || !/^\d+$/.test(username)) {
      throw new ExtractorError(`Invalid username/password; ${SonyLIVIE._LOGIN_HINT}`, { expected: true });
    }

    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z');
    const otpRequest = await this._download_json<{ resultCode?: string; message?: string }>(
      'https://apiv2.sonyliv.com/AGL/1.6/A/ENG/WEB/IN/HR/CREATEOTP-V2',
      'login',
      'Sending OTP',
      {
        headers: this._HEADERS,
        data: JSON.stringify({
          mobileNumber: username,
          channelPartnerID: 'MSMIND',
          country: 'IN',
          timestamp: ts,
          otpSize: 6,
          loginType: 'REGISTERORSIGNIN',
          isMobileMandatory: true,
        }),
      },
    );
    if (otpRequest.resultCode === 'KO') {
      throw new ExtractorError(String(otpRequest.message || 'OTP request failed'), { expected: true });
    }

    const otp = this.params.tfa as string | undefined;
    if (!otp) throw new ExtractorError('OTP required via tfa param', { expected: true });

    const otpVerify = await this._download_json<{
      resultCode?: string;
      message?: string;
      resultObj?: { accessToken?: string };
    }>(
      'https://apiv2.sonyliv.com/AGL/2.0/A/ENG/WEB/IN/HR/CONFIRMOTP-V2',
      'login',
      'Verifying OTP',
      {
        headers: this._HEADERS,
        data: JSON.stringify({
          channelPartnerID: 'MSMIND',
          mobileNumber: username,
          country: 'IN',
          otp,
          dmaId: 'IN',
          ageConfirmation: true,
          timestamp: ts,
          isMobileMandatory: true,
        }),
      },
    );
    if (otpVerify.resultCode === 'KO') {
      throw new ExtractorError(String(otpVerify.message || 'OTP verification failed'), { expected: true });
    }
    this._HEADERS.authorization = otpVerify.resultObj?.accessToken || '';
  }

  protected async _callApi(version: string, path: string, videoId: string): Promise<Record<string, unknown>> {
    const resp = await this._download_json<{ resultObj?: Record<string, unknown> }>(
      `https://apiv2.sonyliv.com/AGL/${version}/A/ENG/WEB/${path}`,
      videoId,
      undefined,
      { headers: this._HEADERS, fatal: true },
    );
    return resp.resultObj || {};
  }

  protected async _initializePreLogin(): Promise<void> {
    this._HEADERS.security_token = String(await this._callApi('1.4', 'ALL/GETTOKEN', ''));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const content = await this._callApi('1.5', `IN/CONTENT/VIDEOURL/VOD/${videoId}`, videoId);
    if (!this.params.allow_unplayable_formats && content.isEncrypted) {
      this.raise_no_formats('DRM protected');
    }
    const dashUrl = String(content.videoURL || '');
    const headers = { 'x-playback-session-id': `${Date.now()}-${Math.random()}` };
    const formats: Format[] = [
      ...(await this._extract_mpd_formats(dashUrl, videoId, 'dash', undefined, false, { headers })),
    ];
    const hlsUrl = dashUrl.replace('.mpd', '.m3u8').replace('/DASH/', '/HLS/');
    const hlsRes = await extractM3u8FormatsAndSubtitles(this, hlsUrl, videoId, 'hls');
    formats.push(...hlsRes.formats.map((f) => ({ ...f, http_headers: { ...headers, ...(f.http_headers || {}) } })));

    const metadata = traverse_obj(await this._callApi('1.6', `IN/DETAIL/${videoId}`, videoId), [
      'containers',
      0,
      'metadata',
    ]) as Record<string, unknown>;
    const subtitles: Record<string, Subtitle[]> = {};
    for (const sub of (content.subtitle as Record<string, unknown>[]) || []) {
      const subUrl = sub.subtitleUrl as string | undefined;
      if (!subUrl) continue;
      const lang = String(sub.subtitleLanguageName || 'ENG');
      (subtitles[lang] ||= []).push({ url: subUrl, ext: 'vtt' });
    }

    return {
      id: videoId,
      title: String(metadata.episodeTitle || videoId),
      formats,
      thumbnail: (content.posterURL as string) || undefined,
      description:
        (metadata.longDescription as string) || (metadata.shortDescription as string) || undefined,
      timestamp: int_or_none(metadata.creationDate, 1000) ?? undefined,
      duration: int_or_none(metadata.duration) ?? undefined,
      season_number: int_or_none(metadata.season) ?? undefined,
      series: (metadata.title as string) || undefined,
      episode_number: int_or_none(metadata.episodeNumber) ?? undefined,
      release_year: int_or_none(metadata.year) ?? undefined,
      subtitles,
    };
  }
}

export class SonyLIVSeriesIE extends InfoExtractor {
  static IE_NAME = 'sonyliv:series';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?sonyliv\.com\/shows\/[^/?#&]+-(?<id>\d{10})\/?(?:$|[?#])/;
  static _API_BASE = 'https://apiv2.sonyliv.com/AGL';
  static _SORT_ORDERS = ['asc', 'desc'] as const;

  protected async *_entries(showId: string, sortOrder: string): AsyncGenerator<VideoInfo> {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://www.sonyliv.com',
    };
    headers.security_token = String(
      (
        await this._download_json<{ resultObj?: string }>(
          `${SonyLIVSeriesIE._API_BASE}/1.4/A/ENG/WEB/ALL/GETTOKEN`,
          showId,
          'Downloading security token',
          { headers },
        )
      ).resultObj,
    );

    const seriesJson = await this._download_json<{ resultObj?: { containers?: Record<string, unknown>[] } }>(
      `${SonyLIVSeriesIE._API_BASE}/1.9/R/ENG/WEB/IN/DL/DETAIL/${showId}`,
      showId,
      'Downloading series JSON',
      { headers, query: { kids_safe: 'false', from: '0', to: '49' } },
    );
    let seasons =
      (traverse_obj(seriesJson, ['resultObj', 'containers', 0, 'containers']) as Record<string, unknown>[]) ||
      [];
    seasons = seasons.filter((v) => int_or_none(v.id) != null);
    if (sortOrder === 'desc') seasons = [...seasons].reverse();

    for (const season of seasons) {
      const seasonId = String(season.id);
      const note = String(traverse_obj(season, ['metadata', 'title']) || 'season');
      let cursor = 0;
      for (let pageNum = 1; ; pageNum++) {
        const episodesJson = await this._download_json<{ resultObj?: { containers?: Record<string, unknown>[] } }>(
          `${SonyLIVSeriesIE._API_BASE}/1.4/R/ENG/WEB/IN/CONTENT/DETAIL/BUNDLE/${seasonId}`,
          seasonId,
          `Downloading ${note} page ${pageNum} JSON`,
          {
            headers,
            query: { from: String(cursor), to: String(cursor + 99), orderBy: 'episodeNumber', sortOrder },
          },
        );
        const episodes =
          (traverse_obj(episodesJson, ['resultObj', 'containers', 0, 'containers']) as Record<string, unknown>[]) ||
          [];
        const filtered = episodes.filter((v) => int_or_none(v.id) != null);
        if (!filtered.length) break;
        for (const episode of filtered) {
          yield this.url_result(`sonyliv:${episode.id}`, 'SonyLIV', String(episode.id));
        }
        cursor += 100;
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const showId = this._match_id(url);
    const ea = this.params.extractor_args as Record<string, { sort_order?: string[] }> | undefined;
    const sortOrder = ea?.sonyliv?.sort_order?.[0] || 'asc';
    if (!SonyLIVSeriesIE._SORT_ORDERS.includes(sortOrder as 'asc' | 'desc')) {
      throw new ExtractorError(
        `Invalid sort order "${sortOrder}". Allowed: ${SonyLIVSeriesIE._SORT_ORDERS.join(', ')}`,
        { expected: true },
      );
    }
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(showId, sortOrder)) entries.push(entry);
    return this.playlist_result(entries, showId);
  }
}

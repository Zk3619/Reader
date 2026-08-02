/**
 * HiDiveIE — ported from yt-dlp hidive.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, url_or_none } from '../../utils';
import { hiddenInputs, urlencodePostdata } from './_helpers';

export class HiDiveIE extends InfoExtractor {
  static IE_NAME = 'hidive';
  static _NETRC_MACHINE = 'hidive';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?hidive\.com\/stream\/(?<id>(?<title>[^/]+)\/(?<key>[^/?#&]+))/;

  protected _LOGIN_URL = 'https://www.hidive.com/account/login';

  protected async _perform_login(username: string, password: string): Promise<void> {
    const webpage = await this._download_webpage(this._LOGIN_URL, undefined);
    const formMatch = webpage.match(/<form[^>]+action="\/account\/login"[^>]*>([\s\S]*?)<\/form>/i);
    if (!formMatch?.[1]) return;
    const data = hiddenInputs(formMatch[1]);
    data.Email = username;
    data.Password = password;
    const loginRes = await this._request_webpage(
      {
        url: this._LOGIN_URL,
        data: urlencodePostdata(data),
      },
      undefined,
      'Logging in',
    );
    if (!loginRes) return;
    const loginWebpage = loginRes.text;
    const profileId = this._search_regex(
      /<button [^>]+?data-profile-id="(\w+)"/,
      loginWebpage,
      'profile id',
      null,
      false,
    );
    if (!profileId) return;
    const hash = this._search_regex(/<button [^>]+?data-hash="(\w+)"/, loginWebpage, 'profile id hash');
    if (!hash) return;
    await this._request_webpage(
      {
        url: 'https://www.hidive.com/ajax/chooseprofile',
        data: urlencodePostdata({ profileId, hash, returnUrl: '/dashboard' }),
      },
      undefined,
      'Choosing profile',
    );
  }

  protected async _callApi(
    videoId: string,
    title: string,
    key: string,
    extra: Record<string, string> = {},
  ): Promise<Record<string, unknown>> {
    const data = {
      ...extra,
      Title: title,
      Key: key,
      PlayerId: 'f4f895ce1ca713ba263b91caeb1daa2d08904783',
    };
    return (
      (await this._download_json<Record<string, unknown>>('https://www.hidive.com/play/settings', videoId, undefined, {
        data: urlencodePostdata(data),
        method: 'POST',
      })) || {}
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const title = m.groups!.title!;
    const key = m.groups!.key!;
    const settings = await this._callApi(videoId, title, key);

    const restriction = settings.restrictionReason as string | undefined;
    if (restriction === 'RegionRestricted') this.raise_geo_restricted();
    if (restriction && restriction !== 'None') {
      throw new ExtractorError(`${this.IE_NAME} said: ${restriction}`, { expected: true });
    }

    const formats: Format[] = [];
    const parsedUrls = new Set<string | null | undefined>([undefined]);
    const renditions = (settings.renditions as Record<string, Record<string, unknown>>) || {};

    for (const [renditionId, rendition] of Object.entries(renditions)) {
      const parts = renditionId.split('_');
      const audio = parts[0];
      const version = parts[1];
      const extra = parts.slice(2).join('_');
      const bitrates = (rendition.bitrates as Record<string, unknown>) || {};
      const m3u8Url = url_or_none(bitrates.hls);
      if (m3u8Url && !parsedUrls.has(m3u8Url)) {
        parsedUrls.add(m3u8Url);
        const frmt = await this._extract_m3u8_formats(
          m3u8Url,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          renditionId,
          undefined,
          false,
        );
        for (const f of frmt) {
          f.language = audio;
          f.format_note = `${version}, ${extra}`;
        }
        formats.push(...frmt);
      }
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const [renditionId, rendition] of Object.entries(renditions)) {
      void renditionId;
      const ccFiles = (rendition.ccFiles as unknown[]) || [];
      for (const ccFile of ccFiles) {
        if (!Array.isArray(ccFile)) continue;
        const ccUrl = url_or_none(ccFile[2]);
        const ccLang = String(ccFile[1] ?? ccFile[0] ?? '')
          .replace(/\s+/g, '-')
          .toLowerCase();
        if (ccUrl && !parsedUrls.has(ccUrl) && ccLang) {
          parsedUrls.add(ccUrl);
          (subtitles[ccLang] ||= []).push({ url: ccUrl, ext: 'vtt' });
        }
      }
    }

    return {
      id: videoId,
      title: videoId,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      formats,
      series: title,
      season_number:
        int_or_none(this._search_regex(/s(\d+)/, key, 'season number', null, false)) ?? undefined,
      episode_number:
        int_or_none(this._search_regex(/e(\d+)/, key, 'episode number', null, false)) ?? undefined,
      http_headers: { Referer: url },
    };
  }
}

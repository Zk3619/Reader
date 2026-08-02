/**
 * ChaturbateIE — ported from yt-dlp chaturbate.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { str_or_none, url_or_none } from '../../utils';
import { rtaSearch, urlencodePostdata } from './_helpers';

const ERROR_MAP: Record<string, string> = {
  offline: 'Room is currently offline',
  private: 'Room is currently in a private show',
  away: 'Performer is currently away',
  'password protected': 'Room is password protected',
  hidden: 'Hidden session in progress',
};

function lowercaseEscape(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export class ChaturbateIE extends InfoExtractor {
  static IE_NAME = 'Chaturbate';
  static _VALID_URL =
    /https?:\/\/(?:[^/]+\.)?chaturbate\.(?<tld>com|eu|global)\/(?:fullvideo\/?\?.*?\bb=)?(?<id>[^/?&#]+)/;

  private async _extractFromApi(videoId: string, tld: string): Promise<VideoInfo | null> {
    const response =
      (await this._download_json<Record<string, unknown>>(
        `https://chaturbate.${tld}/get_edge_hls_url_ajax/`,
        videoId,
        undefined,
        {
          data: urlencodePostdata({ room_slug: videoId }),
          headers: {
            ...this.geo_verification_headers(),
            'X-Requested-With': 'XMLHttpRequest',
            Accept: 'application/json',
          },
          method: 'POST',
          fatal: false,
        },
      )) || {};

    const m3u8Url = url_or_none(response.url);
    if (!m3u8Url) {
      const status = str_or_none(response.room_status);
      const error = status ? ERROR_MAP[status] : undefined;
      if (error) throw new ExtractorError(error, { expected: true });
      if (status === 'public') this.raise_geo_restricted();
      this.report_warning(`Got status "${status}" from API; falling back to webpage extraction`);
      return null;
    }

    return {
      id: videoId,
      title: videoId,
      thumbnail: `https://roomimg.stream.highwebmedia.com/ri/${videoId}.jpg`,
      is_live: true,
      age_limit: 18,
      formats: await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, undefined, undefined, false, {
        headers: this.geo_verification_headers(),
      }),
    };
  }

  private async _extractFromHtml(videoId: string, tld: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(`https://chaturbate.${tld}/${videoId}/`, videoId, undefined, {
      headers: this.geo_verification_headers(),
    });

    const foundM3u8Urls: string[] = [];

    const rawData = this._search_regex(
      /initialRoomDossier\s*=\s*(["'])(?:(?!\1).)+\1/,
      webpage,
      'data',
      '{}',
      false,
    );
    const jsonMatch = /initialRoomDossier\s*=\s*(["'])(?<value>(?:(?!\1).)+)\1/.exec(webpage);
    const data = this._parse_json<Record<string, unknown>>(
      jsonMatch?.groups?.value ?? rawData ?? '{}',
      videoId,
      lowercaseEscape,
      false,
    );
    if (data) {
      const hlsSource = url_or_none(data.hls_source);
      if (hlsSource) foundM3u8Urls.push(hlsSource);
    }

    if (!foundM3u8Urls.length) {
      for (const m of webpage.matchAll(/(?:\\u002[27])(?<url>http.+?\.m3u8.*?)(?:\\u002[27])/g)) {
        if (m.groups?.url) foundM3u8Urls.push(lowercaseEscape(m.groups.url));
      }
    }

    if (!foundM3u8Urls.length) {
      for (const m of webpage.matchAll(/(["'])(?<url>http.+?\.m3u8.*?)\1/g)) {
        if (m.groups?.url) foundM3u8Urls.push(m.groups.url);
      }
    }

    const m3u8Urls: string[] = [];
    for (const foundM3u8Url of foundM3u8Urls) {
      const m3u8FastUrl = foundM3u8Url;
      const m3u8NoFastUrl = foundM3u8Url.replace('_fast', '');
      for (const candidate of [m3u8FastUrl, m3u8NoFastUrl]) {
        if (!m3u8Urls.includes(candidate)) m3u8Urls.push(candidate);
      }
    }

    if (!m3u8Urls.length) {
      let error = this._search_regex(
        [
          /<span[^>]+class=(["'])desc_span\1[^>]*>(?<error>[^<]+)<\/span>/,
          /<div[^>]+id=(["'])defchat\1[^>]*>\s*<p><strong>(?<error>[^<]+)</,
        ],
        webpage,
        'error',
        null,
        false,
        'error',
      );
      if (!error) {
        if (
          [ERROR_MAP.offline!, 'offline_tipping', 'tip_offline'].some((p) => webpage.includes(p))
        ) {
          error = ERROR_MAP.offline!;
        }
      }
      if (error) throw new ExtractorError(error, { expected: true });
      throw new ExtractorError('Unable to find stream URL');
    }

    const formats: Format[] = [];
    for (const m3u8Url of m3u8Urls) {
      let m3u8Id: string | undefined;
      for (const knownId of ['fast', 'slow']) {
        if (m3u8Url.includes(`_${knownId}`)) {
          m3u8Id = knownId;
          break;
        }
      }
      formats.push(
        ...(await this._extract_m3u8_formats(
          m3u8Url,
          videoId,
          'mp4',
          'm3u8_native',
          m3u8Id === 'fast' ? -10 : undefined,
          undefined,
          m3u8Id,
          undefined,
          false,
        )),
      );
    }

    return {
      id: videoId,
      title: videoId,
      thumbnail: `https://roomimg.stream.highwebmedia.com/ri/${videoId}.jpg`,
      age_limit: rtaSearch(webpage) ?? undefined,
      is_live: true,
      formats,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const tld = m.groups!.tld!;
    return (await this._extractFromApi(videoId, tld)) || (await this._extractFromHtml(videoId, tld));
  }
}

/**
 * CSpanIE / CSpanCongressIE — ported from yt-dlp cspan.py
 * Pragmatic main path: the modern `jwsetup` JS blob covers essentially all
 * current pages (per upstream comment as of 2020-12-01); the obsolete
 * clip/prog id + flashXml.php fallback and Ustream/SenateISVP/Brightcove
 * embed detours are omitted.
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, get_element_by_class, int_or_none, js_to_json, parse_qs, str_to_int } from '../../utils';
import { parseIso8601, parseJwplayerData } from './_helpers';

export class CSpanIE extends InfoExtractor {
  static IE_NAME = 'CSpan';
  static IE_DESC = 'C-SPAN';
  static _VALID_URL = /https?:\/\/(?:www\.)?c-span\.org\/video\/\?(?<id>[0-9a-f]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const addReferer = (formats: Format[]) => {
      for (const f of formats) f.http_headers = { ...(f.http_headers || {}), Referer: url };
    };

    const jwsetupRaw = this._search_regex(/jwsetup\s*=\s*({.+?})\s*;/s, webpage, 'jwsetup', '{}', false);
    const jwsetup = this._parse_json<Record<string, unknown>>(jwsetupRaw ? js_to_json(jwsetupRaw) : '{}', videoId, null, false);

    if (jwsetup) {
      const info = await parseJwplayerData(this, jwsetup, videoId, { requireTitle: false, m3u8Id: 'hls', baseUrl: url });
      addReferer(info.formats || []);
      for (const subs of Object.values(info.subtitles || {})) {
        for (const subtitle of subs) {
          let ext = determine_ext(subtitle.url);
          if (ext === 'php') ext = 'vtt';
          subtitle.ext = ext;
        }
      }
      const ldInfo = this._search_json_ld(webpage, videoId, { fatal: false });
      const title =
        get_element_by_class('video-page-title', webpage) || this._og_search_title(webpage) || undefined;
      const description =
        this._html_search_regex(
          /itemprop=["']description["'][^>]*>([\s\S]*?)<\/[^>]+>/,
          webpage,
          'description',
          null,
          false,
        ) || this._html_search_meta(['og:description', 'description'], webpage) || undefined;
      const uploadDate = this._html_search_regex(
        /itemprop=["']uploadDate["'][^>]*content=["']([^"']+)["']/,
        webpage,
        'upload date',
        null,
        false,
      );
      const location = this._html_search_regex(
        /itemprop=["']contentLocation["'][^>]*content=["']([^"']+)["']/,
        webpage,
        'location',
        null,
        false,
      );
      const thumbnail = this._html_search_regex(
        /itemprop=["']thumbnailUrl["'][^>]*content=["']([^"']+)["']/,
        webpage,
        'thumbnail',
        null,
        false,
      );
      const duration = int_or_none(this._search_regex(/jwsetup\.seclength\s*=\s*(\d+);/, webpage, 'duration', null, false));
      const viewCount = str_to_int(
        this._search_regex(/<span[^>]+class=['"]views['"][^>]*>([\d,]+)\s+Views<\/span>/, webpage, 'views', null, false),
      );

      return {
        ...ldInfo,
        ...info,
        title,
        thumbnail: thumbnail ?? undefined,
        description,
        timestamp: (uploadDate ? parseIso8601(uploadDate) : undefined) ?? undefined,
        location,
        duration: duration ?? undefined,
        view_count: viewCount ?? undefined,
      } as VideoInfo;
    }

    throw new ExtractorError('Unable to extract video info: only the jwsetup main path is ported', { expected: true });
  }
}

export class CSpanCongressIE extends InfoExtractor {
  static IE_NAME = 'CSpanCongress';
  static _VALID_URL = /https?:\/\/(?:www\.)?c-span\.org\/congress\//;

  async _real_extract(url: string): Promise<VideoInfo> {
    const query = parse_qs(url);
    const videoDate = query.date?.[0];
    const chamber = query.chamber?.[0] || 'senate';
    let videoId = videoDate ? `${chamber}_${videoDate}` : chamber;
    const webpage = await this._download_webpage(url, videoId);
    if (!videoDate) {
      const jwpDate = /jwsetup\.clipprogdate\s*=\s*'(?<date>\d{4}-\d{2}-\d{2})'/.exec(webpage);
      if (jwpDate) videoId = `${videoId}_${jwpDate.groups!.date}`;
    }
    const jwplayerRaw = this._search_regex(/jwsetup\s*=\s*({(?:.|\n)[^;]+});/, webpage, 'player config');
    const jwplayerData = this._parse_json<Record<string, unknown>>(js_to_json(jwplayerRaw!), videoId)!;

    const rawTitle = this._html_search_regex(/<title[^>]*>([^<]+)<\/title>/i, webpage, 'title', null, false) || videoId;
    const title = rawTitle.split('|')[0]!.replace(/\s+/g, ' ').trim();
    const description =
      this._og_search_description(webpage) ||
      this._html_search_meta('description', webpage, 'description', false) ||
      undefined;

    const info = await parseJwplayerData(this, jwplayerData, videoId, { requireTitle: false });

    return {
      ...info,
      title,
      description,
      http_headers: { Referer: 'https://www.c-span.org/' },
    };
  }
}

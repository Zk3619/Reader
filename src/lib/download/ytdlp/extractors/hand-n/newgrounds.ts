/**
 * Newgrounds family — ported from yt-dlp newgrounds.py (main media path; login edge simplified)
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  get_element_by_id,
  int_or_none,
  parse_count,
  parse_duration,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { urljoin } from './_helpers';

const AGE_LIMIT: Record<string, number> = { e: 0, t: 13, m: 17, a: 18 };

export class NewgroundsIE extends InfoExtractor {
  static IE_NAME = 'newgrounds';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?newgrounds\.com\/(?:audio\/listen|portal\/view)\/(?<id>\d+)(?:\/format\/flash)?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mediaId = this._match_id(url);
    let webpage: string;
    try {
      webpage = await this._download_webpage(url, mediaId);
    } catch (e) {
      if ((e as { cause?: { status?: number } })?.cause?.status === 401) this.raise_login_required();
      throw e;
    }

    const mediaUrlString = this._search_regex(
      /embedController\(\[{"url"\s*:\s*("([^"]+)"),/,
      webpage,
      'media url',
      undefined,
      false,
    );
    let formats: Format[] = [];
    if (mediaUrlString) {
      formats = [{ url: this._parse_json<string>(mediaUrlString, mediaId)!, format_id: 'source' }];
    } else {
      const sources = this._search_json<{ sources?: Array<Record<string, unknown>> }>(
        /window\.(?:ng|NG)\.config\s*=/,
        webpage,
        'NG config',
        mediaId,
        { fatal: false },
      );
      for (const src of sources?.sources || []) {
        const srcUrl = url_or_none(src.src);
        if (!srcUrl) continue;
        formats.push({
          format_id: String(src.label || src.type || 'http'),
          url: srcUrl,
          height: int_or_none(src.height) ?? undefined,
        });
      }
    }

    const ageRating = this._search_regex(/class="rated([^"]+)"/, webpage, 'age rating', undefined, false);
    const uploader = clean_html(get_element_by_id('author_name', webpage) || '') || undefined;

    return {
      id: mediaId,
      title: this._html_search_regex(/<title>([^<]+)<\/title>/, webpage, 'title', undefined, false)?.replace(
        ' - Newgrounds.com',
        '',
      ),
      uploader,
      timestamp: unified_timestamp(this._search_regex(/"date":"([^"]+)"/, webpage, 'date', undefined, false)) ?? undefined,
      upload_date: undefined,
      duration: parse_duration(this._search_regex(/"duration":(\d+)/, webpage, 'duration', undefined, false)) ?? undefined,
      view_count: parse_count(this._search_regex(/"views":"([^"]+)"/, webpage, 'views', undefined, false)) ?? undefined,
      description: clean_html(get_element_by_id('author_comments', webpage) || '') || undefined,
      age_limit: ageRating ? AGE_LIMIT[ageRating.toLowerCase()] : undefined,
      thumbnail: url_or_none(this._search_regex(/property="og:image" content="([^"]+)"/, webpage, 'thumbnail', undefined, false)) ?? undefined,
      formats,
    };
  }
}

export class NewgroundsPlaylistIE extends InfoExtractor {
  static IE_NAME = 'newgrounds:playlist';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?newgrounds\.com\/collection\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(/href="(\/portal\/view\/\d+)"/g)) {
      entries.push(this.url_result(urljoin(url, m[1]!), 'Newgrounds') as VideoInfo);
    }
    return this.playlist_result(entries, playlistId);
  }
}

export class NewgroundsUserIE extends InfoExtractor {
  static IE_NAME = 'newgrounds:user';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?newgrounds\.com\/(?<id>[\w-]+(?:\/(?:movies|audio|art))?)\/?(?:[?#]|$)/;

  static suitable(url: string): boolean {
    if (NewgroundsIE.suitable(url) || NewgroundsPlaylistIE.suitable(url)) return false;
    return InfoExtractor.suitable.call(this, url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const userId = this._match_id(url);
    const webpage = await this._download_webpage(url, userId);
    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(/href="(\/(?:portal\/view|audio\/listen)\/\d+)"/g)) {
      entries.push(this.url_result(urljoin('https://www.newgrounds.com', m[1]!), 'Newgrounds') as VideoInfo);
    }
    return this.playlist_result(entries, userId);
  }
}

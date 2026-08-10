/**
 * Newgrounds family — aligned with yt-dlp newgrounds.py
 *
 * portal/view/689400 等无 embedController 时，需调 /portal/video/{id} JSON 拉多清晰度 mp4。
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

  static readonly _TESTS = [
    { url: 'https://www.newgrounds.com/portal/view/689400', only_matching: true },
    { url: 'https://www.newgrounds.com/audio/listen/549479', only_matching: true },
    { url: 'https://www.newgrounds.com/portal/view/297383/format/flash', only_matching: true },
  ];

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
      /embedController\(\[{"url"\s*:\s*("[^"]+"),/,
      webpage,
      'media url',
      undefined,
      false,
    );

    let formats: Format[] = [];
    let uploader: string | undefined;

    if (mediaUrlString) {
      const parsed = this._parse_json<string>(mediaUrlString, mediaId);
      if (parsed) {
        formats = [{ url: parsed, format_id: 'source', quality: 1 }];
      }
    } else {
      // source 不可用时走 portal video API（如 689400）
      const jsonVideo = await this._download_json<Record<string, unknown>>(
        `https://www.newgrounds.com/portal/video/${mediaId}`,
        mediaId,
        'Downloading video JSON',
        {
          headers: {
            Accept: 'application/json',
            Referer: url,
            'X-Requested-With': 'XMLHttpRequest',
          },
        },
      );
      uploader =
        typeof jsonVideo?.author === 'string'
          ? jsonVideo.author
          : ((jsonVideo?.author as { name?: string } | undefined)?.name as string | undefined);

      const sources = jsonVideo?.sources;
      if (sources && typeof sources === 'object' && !Array.isArray(sources)) {
        for (const [formatId, entries] of Object.entries(sources as Record<string, unknown>)) {
          const quality = int_or_none(formatId.replace(/p$/i, '')) ?? undefined;
          const list = Array.isArray(entries) ? entries : [entries];
          for (const entry of list) {
            const src =
              typeof entry === 'string'
                ? url_or_none(entry)
                : url_or_none((entry as { src?: unknown })?.src);
            if (!src) continue;
            formats.push({
              format_id: formatId,
              quality,
              url: src,
            });
          }
        }
      }
    }

    if (!uploader) {
      uploader =
        this._html_search_regex(
          /<h4[^>]*>(.+?)<\/h4>[\s\S]*?<em>\s*(?:Author|Artist)\s*<\/em>/,
          webpage,
          'uploader',
          undefined,
          false,
        ) ||
        this._html_search_regex(
          /(?:Author|Writer)\s*<a[^>]+>([^<]+)/,
          webpage,
          'uploader',
          undefined,
          false,
        ) ||
        clean_html(get_element_by_id('author_name', webpage) || '') ||
        undefined;
    }

    if (formats.length === 1) {
      const filesize = int_or_none(
        this._html_search_regex(/"filesize"\s*:\s*["']?([\d]+)["']?,/, webpage, 'filesize', undefined, false),
      );
      if (filesize != null) formats[0]!.filesize = filesize;
      const videoType = this._html_search_regex(
        /"description"\s*:\s*["']?([^"']+)["']?,/,
        webpage,
        'media type',
        undefined,
        false,
      );
      if (videoType === 'Audio File') formats[0]!.vcodec = 'none';
    }

    formats = await this._check_formats(formats, mediaId);
    if (!formats.length) {
      this.raise_no_formats('No media formats found on Newgrounds', true);
    }

    const ageKey =
      this._html_search_regex(/<h2\s+class=["']rated-([etma])["']/i, webpage, 'age_limit', undefined, false) ||
      this._search_regex(/class="rated-?([etma])"/i, webpage, 'age rating', undefined, false) ||
      'e';

    return {
      id: mediaId,
      title:
        this._html_extract_title(webpage) ||
        this._html_search_regex(/<title>([^<]+)<\/title>/, webpage, 'title', undefined, false)?.replace(
          /\s*-\s*Newgrounds\.com\s*$/i,
          '',
        ) ||
        undefined,
      uploader,
      timestamp:
        unified_timestamp(
          this._search_regex(
            /itemprop="(?:uploadDate|datePublished)"\s+content="([^"]+)"/,
            webpage,
            'timestamp',
            undefined,
            false,
          ),
        ) ?? undefined,
      duration:
        parse_duration(
          this._html_search_regex(/"duration"\s*:\s*["']?(\d+)["']?/, webpage, 'duration', undefined, false),
        ) ?? undefined,
      view_count:
        parse_count(
          this._html_search_regex(
            /<dt>\s*(?:Views|Listens)\s*<\/dt>\s*<dd>([\d.,]+)<\/dd>/i,
            webpage,
            'view count',
            undefined,
            false,
          ),
        ) ?? undefined,
      description:
        clean_html(get_element_by_id('author_comments', webpage) || '') ||
        this._og_search_description(webpage) ||
        undefined,
      age_limit: AGE_LIMIT[ageKey.toLowerCase()] ?? 0,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      formats,
      webpage_url: url,
      extractor: 'newgrounds',
      extractor_key: 'Newgrounds',
    };
  }
}

export class NewgroundsPlaylistIE extends InfoExtractor {
  static IE_NAME = 'newgrounds:playlist';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?newgrounds\.com\/(?:collection|[^/]+\/search\/[^/]+)\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(/href="(\/(?:portal\/view|audio\/listen)\/\d+)"/g)) {
      entries.push(this.url_result(urljoin(url, m[1]!), 'Newgrounds') as VideoInfo);
    }
    return this.playlist_result(entries, playlistId);
  }
}

export class NewgroundsUserIE extends InfoExtractor {
  static IE_NAME = 'newgrounds:user';
  /** subdomain user pages: burn7.newgrounds.com/movies */
  static _VALID_URL =
    /https?:\/\/(?<id>[^.]+)\.newgrounds\.com\/(?:movies|audio)\/?(?:[#?]|$)/;

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

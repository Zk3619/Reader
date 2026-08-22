// @ts-nocheck
/** YouPorn extractors — ported from yt-dlp youporn.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  extract_attributes,
  get_element_by_class,
  get_element_by_id,
  int_or_none,
  merge_dicts,
  parse_count,
  parse_qs,
  unified_strdate,
  url_or_none,
} from '../../utils';

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getElementsHtmlByClass(cls: string, html: string): string[] {
  const out: string[] = [];
  const re = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\sclass=["'][^"']*\\b${esc(cls)}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[0] || '');
  return out;
}

function joinUrl(base: string, rel: string): string {
  try {
    return new URL(rel, base).toString();
  } catch {
    return rel;
  }
}

export class YouPornIE extends InfoExtractor {
  static IE_NAME = 'YouPorn';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?youporn\.com\/(?:watch|embed)\/(?<id>\d+)(?:\/(?<display_id>[^/?#&]+))?\/?(?:[#?]|$)/;
  static _EMBED_REGEX = [
    /<iframe[^>]+\bsrc=["'](?<url>(?:https?:)?\/\/(?:www\.)?youporn\.com\/embed\/\d+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const videoId = m?.groups?.id;
    if (!videoId) throw new ExtractorError('Invalid YouPorn URL');
    const displayId = m.groups?.display_id || undefined;

    // yt-dlp: age_verified cookie required for watch page
    await this._set_cookie('.youporn.com', 'age_verified', '1');
    const webpage = await this._download_webpage(
      `https://www.youporn.com/watch/${videoId}`,
      videoId,
      'Downloading YouPorn webpage',
      {
        headers: {
          Referer: 'https://www.youporn.com/',
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: 'age_verified=1',
        },
      },
    );
    const watchable = this._search_regex(
      /<div\s[^>]*\bid\s*=\s*["']?watch-container\b[^>]*>/i,
      webpage,
      'watchability',
      null,
      false,
    );
    if (!watchable) {
      const msgRaw = clean_html(get_element_by_id('mainContent', webpage) || '') || '';
      const msg = msgRaw.split(/\s{2,}/)[0]?.trim();
      throw new ExtractorError(msg ? `${this.IE_NAME} says: ${msg}` : 'Video unavailable', {
        expected: true,
      });
    }

    const playerVars =
      this._search_json<Record<string, unknown>>(/\bplayervars\s*:/, webpage, 'player vars', videoId) ||
      {};
    const defs = Array.isArray((playerVars as { mediaDefinitions?: unknown }).mediaDefinitions)
      ? ((playerVars as { mediaDefinitions: unknown[] }).mediaDefinitions as Array<
          Record<string, unknown>
        >)
      : [];

    const getFormatData = async (streamType: string): Promise<Array<Record<string, unknown>>> => {
      const infoUrl = defs.find(
        (v) => v?.format === streamType && typeof v.videoUrl === 'string',
      )?.videoUrl;
      if (!url_or_none(infoUrl)) return [];
      const data = await this._download_json<unknown>(
        String(infoUrl),
        videoId,
        `Downloading ${streamType} info JSON`,
        { fatal: false },
      );
      if (!Array.isArray(data)) return [];
      return data.filter(
        (v): v is Record<string, unknown> =>
          !!v &&
          typeof v === 'object' &&
          (v as Record<string, unknown>).format === streamType &&
          typeof (v as Record<string, unknown>).videoUrl === 'string',
      );
    };

    const formats: Format[] = [];
    const hlsData = await getFormatData('hls');
    const hlsUrls = hlsData
      .filter((v) => typeof v.defaultQuality !== 'boolean')
      .map((v) => url_or_none(v.videoUrl))
      .filter((v): v is string => !!v);
    const fallbackHlsUrls = hlsData
      .map((v) => url_or_none(v.videoUrl))
      .filter((v): v is string => !!v);
    for (const hlsUrl of hlsUrls.length ? hlsUrls : fallbackHlsUrls) {
      formats.push(
        ...(await this._extract_m3u8_formats(
          hlsUrl,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        )),
      );
    }

    const mp4Data = await getFormatData('mp4');
    for (const d of mp4Data) {
      const videoUrl = url_or_none(d.videoUrl);
      if (!videoUrl) continue;
      let height = int_or_none(d.quality);
      const f: Format = {
        format_id: 'http',
        url: videoUrl,
        filesize: int_or_none(d.videoSize) ?? undefined,
      };
      const pm = videoUrl.match(/(?<height>\d{3,4})[pP]_(?<bitrate>\d+)[kK]_\d+/);
      if (pm?.groups) {
        if (!height) height = int_or_none(pm.groups.height);
        const bitrate = int_or_none(pm.groups.bitrate);
        if (height && bitrate) {
          f.format_id = `${height}p-${bitrate}k`;
          f.tbr = bitrate;
        }
      }
      f.height = height ?? undefined;
      formats.push(f);
    }

    if (!formats.length) {
      throw new ExtractorError('No YouPorn formats found', { expected: true });
    }

    const title =
      this._html_search_regex(
        /<div[^>]+class=["'][^"']*watchVideoTitle[^"']*["'][^>]*>([\s\S]+?)<\/div>/i,
        webpage,
        'title',
        null,
        false,
      ) ||
      this._og_search_title(webpage, false) ||
      this._html_search_meta('title', webpage, 'title', true);
    const description =
      this._html_search_regex(
        /<div[^>]+\bid=["']description["'][^>]*>([\s\S]+?)<\/div>/i,
        webpage,
        'description',
        null,
        false,
      ) || this._og_search_description(webpage);
    const thumbnail = this._search_regex(
      /(?:imageurl\s*=|poster\s*:)\s*(["'])(?<thumbnail>.+?)\1/i,
      webpage,
      'thumbnail',
      null,
      false,
      'thumbnail',
    );
    let duration = int_or_none((playerVars as { duration?: unknown }).duration);
    if (duration == null) {
      duration = int_or_none(this._html_search_meta('video:duration', webpage, 'duration', false));
    }
    const uploader = this._html_search_regex(
      /<div[^>]+class=["']submitByLink["'][^>]*>([\s\S]+?)<\/div>/i,
      webpage,
      'uploader',
      null,
      false,
    );
    const uploadDate = unified_strdate(
      this._html_search_regex(
        [
          /UPLOADED:\s*<span>([^<]+)/i,
          /Date\s+[Aa]dded:\s*<span>([^<]+)/,
          /<div[^>]+class=["']videoInfo(?:Date|Time)\b[^>]*>([\s\S]+?)<\/div>/i,
          /<label\b[^>]*>Uploaded[^<]*<\/label>\s*<span\b[^>]*>([\s\S]+?)<\/span>/i,
        ],
        webpage,
        'upload date',
        null,
        false,
      ),
    );

    let viewCount: number | null = null;
    const viewsTag = this._search_regex(
      /(<div [^>]*\bdata-value\s*=[^>]+>)\s*<label>Views:<\/label>/i,
      webpage,
      'views',
      null,
      false,
    );
    if (viewsTag) viewCount = parse_count(extract_attributes(viewsTag)['data-value']);
    const commentCount = parse_count(
      this._search_regex(/>All [Cc]omments? \(([\d,.]+)\)/, webpage, 'comment count', null, false),
    );

    const extractTagBox = (regex: RegExp, label: string): string[] => {
      const box = this._search_regex(regex, webpage, label, null, false);
      if (!box) return [];
      return [...box.matchAll(/<a[^>]+href=[^>]+>([^<]+)/g)]
        .map((mm) => mm[1]!.trim())
        .filter(Boolean);
    };
    const categories = extractTagBox(/Categories:.*?<\/[^>]+>([\s\S]+?)<\/div>/i, 'categories');
    const tags = extractTagBox(
      /Tags:.*?<\/div>\s*<div[^>]+class=["']tagBoxContent["'][^>]*>([\s\S]+?)<\/div>/i,
      'tags',
    );

    const data = this._search_json_ld(webpage, videoId, {
      expected_type: 'VideoObject',
      fatal: false,
    });
    delete (data as Record<string, unknown>).url;
    const result = merge_dicts(data, {
      id: videoId,
      display_id: displayId,
      title,
      description,
      thumbnail: thumbnail || undefined,
      duration: duration ?? undefined,
      uploader: uploader || undefined,
      upload_date: uploadDate || undefined,
      view_count: viewCount ?? undefined,
      comment_count: commentCount ?? undefined,
      categories,
      tags,
      age_limit: 18,
      formats: this._sort_formats(formats),
      webpage_url: `https://www.youporn.com/watch/${videoId}`,
      original_url: url,
      extractor: 'YouPorn',
      extractor_key: 'YouPorn',
    }) as VideoInfo;

    if (
      typeof result.description === 'string' &&
      result.description.startsWith(`Watch ${String(result.title || '')} online`)
    ) {
      delete (result as Record<string, unknown>).description;
    }
    return result;
  }
}

export class YouPornListBaseIE extends InfoExtractor {
  static _VALID_URL = false;

  protected _get_next_url(url: string, _plId: string, html: string): string | null {
    const nextPart = get_element_by_id('next', html) || '';
    const nextUrl = this._search_regex(/<a [^>]*?\bhref\s*=\s*(["'])(?<url>(?:(?!\1)[^>])+)\1/i, nextPart, 'next page', null, false, 'url');
    return nextUrl ? joinUrl(url, nextUrl) : null;
  }

  static _get_title_from_slug(titleSlug: string): string {
    return titleSlug.replace(/[_-]/g, ' ');
  }

  protected async _entries(url: string, plId: string, html?: string, pageNum?: number): Promise<VideoInfo[]> {
    const entries: VideoInfo[] = [];
    let pageHtml: string | undefined = html;
    const start = pageNum || 1;
    for (let page = start; page < 1000; page++) {
      if (!pageHtml) {
        pageHtml = await this._download_webpage(url, plId, `Downloading page ${page}`, { fatal: page === start });
      }
      if (!pageHtml) break;
      for (const element of getElementsHtmlByClass('video-title', pageHtml)) {
        const href = extract_attributes(element).href;
        const videoUrl = href ? joinUrl(url, href) : null;
        if (videoUrl) entries.push(this.url_result(videoUrl));
      }
      if (pageNum != null) break;
      const nextUrl = this._get_next_url(url, plId, pageHtml);
      if (!nextUrl || nextUrl === url) break;
      url = nextUrl;
      pageHtml = undefined;
    }
    return entries;
  }

  async _real_extract(url: string, html?: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    if (!m) throw new ExtractorError('Invalid list URL');
    const gd = m.groups || {};
    const rawId = (gd.id as string | undefined) || 'YouPorn';
    const pageType = gd.type as string | undefined;
    const sort = gd.sort as string | undefined;
    const qs = Object.fromEntries(
      Object.entries(parse_qs(url))
        .filter(([, v]) => Array.isArray(v) && v.length)
        .map(([k, v]) => [k, v[v.length - 1] as string]),
    ) as Record<string, string>;

    const ctor = this.constructor as typeof YouPornListBaseIE;
    let title = ctor._get_title_from_slug(rawId);
    if (pageType) title = `${pageType[0]!.toUpperCase()}${pageType.slice(1)} ${title}`;
    const baseParts = [rawId.toLowerCase()];
    if (sort == null) title += ' videos';
    else {
      title = `${title} videos by ${sort.replace(/[_-]/g, ' ')}`;
      baseParts.push(sort);
    }
    if (Object.keys(qs).length) {
      const filters = Object.entries(qs).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`);
      title += ` (${filters.join(',')})`;
      baseParts.push(...filters);
    }
    const playlistId = baseParts.join('/');
    const entries = await this._entries(url, playlistId, html, int_or_none(qs.page) ?? undefined);
    return this.playlist_result(entries, playlistId, title);
  }
}

export class YouPornCategoryIE extends YouPornListBaseIE {
  static IE_DESC = 'YouPorn category, with sorting, filtering and pagination';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?youporn\.com\/(?<type>category)\/(?<id>[^/?#&]+)(?:\/(?<sort>popular|views|rating|time|duration))?\/?(?:[#?]|$)/;
}

export class YouPornChannelIE extends YouPornListBaseIE {
  static IE_DESC = 'YouPorn channel, with sorting and pagination';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?youporn\.com\/(?<type>channel)\/(?<id>[^/?#&]+)(?:\/(?<sort>rating|views|duration))?\/?(?:[#?]|$)/;

  static _get_title_from_slug(titleSlug: string): string {
    return titleSlug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export class YouPornCollectionIE extends YouPornListBaseIE {
  static IE_DESC = 'YouPorn collection (user playlist), with sorting and pagination';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?youporn\.com\/(?<type>collection)s\/videos\/(?<id>\d+)(?:\/(?<sort>rating|views|time|duration))?\/?(?:[#?]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const plId = this._match_id(url);
    const html = await this._download_webpage(url, plId);
    const playlist = await super._real_extract(url, html);
    const infos = (clean_html(get_element_by_class('collection-infos', html) || '') || '').replace(/\s+/g, ' ').trim();
    const mu = infos.match(/^Collection: (?<title>.+?) \d+ VIDEOS \d+ VIEWS \d+ days LAST UPDATED From: (?<uploader>[\w_-]+)/);
    const parsedTitle = mu?.groups?.title;
    const uploader = mu?.groups?.uploader;
    if (parsedTitle && typeof playlist.title === 'string' && typeof playlist.id === 'string') {
      playlist.title = playlist.title.replace(playlist.id.split('/')[0] || '', parsedTitle);
      (playlist as Record<string, unknown>).uploader = uploader || undefined;
    }
    return playlist;
  }
}

export class YouPornTagIE extends YouPornListBaseIE {
  static IE_DESC = 'YouPorn tag (porntags), with sorting, filtering and pagination';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?youporn\.com\/porn(?<type>tag)s\/(?<id>[^/?#&]+)(?:\/(?<sort>views|rating|time|duration))?\/?(?:[#?]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    this.report_warning('YouPorn tag pages are not correctly cached and often return incorrect results');
    return super._real_extract(url);
  }
}

export class YouPornStarIE extends YouPornListBaseIE {
  static IE_DESC = 'YouPorn Pornstar, with description, sorting and pagination';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?youporn\.com\/(?<type>pornstar)\/(?<id>[^/?#&]+)(?:\/(?<sort>rating|views|duration))?\/?(?:[#?]|$)/;

  static _get_title_from_slug(titleSlug: string): string {
    return titleSlug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const plId = this._match_id(url);
    const html = await this._download_webpage(url, plId);
    const playlist = await super._real_extract(url, html);
    const infoMatch = html.match(
      /<div [^>]*\bclass\s*=\s*["'][^"']*pornstar-info-wrapper[^"']*["'][^>]*>(?<info>[\s\S]+?)(?:<\/div>\s*){6,}/i,
    );
    let infos = infoMatch?.groups?.info || '';
    if (infos) {
      infos = infos.replace(/\n/g, 'nl=nl');
      infos = clean_html(infos)?.replace(/\s+/g, ' ').replace(/(?:\s*nl=nl)+\s*/g, ' ').replace('ribe Subsc', '') || '';
    }
    return { ...playlist, description: infos.trim() || undefined };
  }
}

export class YouPornVideosIE extends YouPornListBaseIE {
  static IE_DESC = 'YouPorn video (browse) playlists, with sorting, filtering and pagination';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?youporn\.com\/(?:(?<id>browse)\/)?(?<sort>(?:duration|rating|time|views)|(?:most_(?:favou?rit|view)ed|recommended|top_rated)?)?(?:[/#?]|$)/;

  static _get_title_from_slug(titleSlug: string): string {
    return titleSlug === 'browse' ? 'YouPorn' : titleSlug;
  }
}

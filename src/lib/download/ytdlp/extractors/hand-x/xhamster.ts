// @ts-nocheck
/** XHamsterIE / XHamsterEmbedIE / XHamsterUserIE â€?ported from yt-dlp xhamster.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  dict_get,
  extract_attributes,
  float_or_none,
  int_or_none,
  parse_duration,
  str_or_none,
  try_get,
  unified_strdate,
  url_or_none,
} from '../../utils';
import { rtaSearch } from './_helpers';

const XH_DOMAINS =
  '(?:xhamster\\.(?:com|one|desi)|xhms\\.pro|xhamster\\d+\\.(?:com|desi)|xhday\\.com|xhvid\\.com)';

function intToInt32(n: number): number {
  return n | 0;
}

class ByteGenerator {
  private _algorithm: (s: number) => number;
  private _s: number;

  constructor(algoId: number, seed: number) {
    switch (algoId) {
      case 1:
        this._algorithm = this._algo1.bind(this);
        break;
      case 2:
        this._algorithm = this._algo2.bind(this);
        break;
      case 3:
        this._algorithm = this._algo3.bind(this);
        break;
      case 4:
        this._algorithm = this._algo4.bind(this);
        break;
      case 5:
        this._algorithm = this._algo5.bind(this);
        break;
      case 6:
        this._algorithm = this._algo6.bind(this);
        break;
      case 7:
        this._algorithm = this._algo7.bind(this);
        break;
      default:
        throw new ExtractorError(`Unknown algorithm ID "${algoId}"`);
    }
    this._s = intToInt32(seed);
  }

  private _algo1(s: number): number {
    s = this._s = intToInt32(Math.imul(s, 1664525) + 1013904223);
    return s;
  }

  private _algo2(s: number): number {
    s = intToInt32(s ^ (s << 13));
    s = intToInt32(s ^ ((s >>> 0) >>> 17));
    s = this._s = intToInt32(s ^ (s << 5));
    return s;
  }

  private _algo3(s: number): number {
    s = this._s = intToInt32(s + 0x9e3779b9);
    s = intToInt32(s ^ ((s >>> 0) >>> 16));
    s = intToInt32(Math.imul(s, intToInt32(0x85ebca77)));
    s = intToInt32(s ^ ((s >>> 0) >>> 13));
    s = intToInt32(Math.imul(s, intToInt32(0xc2b2ae3d)));
    return intToInt32(s ^ ((s >>> 0) >>> 16));
  }

  private _algo4(s: number): number {
    s = this._s = intToInt32(s + 0x6d2b79f5);
    s = intToInt32((s << 7) | ((s >>> 0) >>> 25)); // ROL 7
    s = intToInt32(s + 0x9e3779b9);
    s = intToInt32(s ^ ((s >>> 0) >>> 11));
    return intToInt32(Math.imul(s, 0x27d4eb2d));
  }

  private _algo5(s: number): number {
    s = intToInt32(s ^ (s << 7));
    s = intToInt32(s ^ ((s >>> 0) >>> 9));
    s = intToInt32(s ^ (s << 8));
    s = this._s = intToInt32(s + 0xa5a5a5a5);
    return s;
  }

  private _algo6(s: number): number {
    s = this._s = intToInt32(Math.imul(s, intToInt32(0x2c9277b5)) + intToInt32(0xac564b05));
    const s2 = intToInt32(s ^ ((s >>> 0) >>> 18));
    const shift = ((s >>> 0) >>> 27) & 31;
    return intToInt32((s2 >>> 0) >>> shift);
  }

  private _algo7(s: number): number {
    s = this._s = intToInt32(s + intToInt32(0x9e3779b9));
    let e = intToInt32(s ^ (s << 5));
    e = intToInt32(Math.imul(e, intToInt32(0x7feb352d)));
    e = intToInt32(e ^ ((e >>> 0) >>> 15));
    return intToInt32(Math.imul(e, intToInt32(0x846ca68b)));
  }

  next(): number {
    return this._algorithm(this._s) & 0xff;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function latin1Decode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

export class XHamsterIE extends InfoExtractor {
  static IE_NAME = 'XHamster';
  static _DOMAINS = XH_DOMAINS;
  static _VALID_URL = new RegExp(
    String.raw`https?://(?:[^/?#]+\.)?${XH_DOMAINS}/(?:movies/(?<id>[\dA-Za-z]+)/(?<display_id>[^/]*)\.html|videos/(?<display_id_2>[^/]*)-(?<id_2>[\dA-Za-z]+))`,
  );

  static _VALID_HEX_RE = /^[0-9a-fA-F]{12,}$/;

  protected _decipherHexString(hexString: string, formatId: string): string | null {
    const byteData = hexToBytes(hexString);
    const seed =
      byteData[1]! |
      (byteData[2]! << 8) |
      (byteData[3]! << 16) |
      (byteData[4]! << 24);

    let byteGen: ByteGenerator;
    try {
      byteGen = new ByteGenerator(byteData[0]!, seed | 0);
    } catch (e) {
      const msg = e instanceof ExtractorError ? e.message : String(e);
      this.report_warning(`Skipping format "${formatId}": ${msg}`);
      return null;
    }

    const out = new Uint8Array(byteData.length - 5);
    for (let i = 5; i < byteData.length; i++) {
      out[i - 5] = byteData[i]! ^ byteGen.next();
    }
    return latin1Decode(out);
  }

  protected _decipherFormatUrl(formatUrl: string, formatId: string): string | null {
    if (XHamsterIE._VALID_HEX_RE.test(formatUrl)) {
      return this._decipherHexString(formatUrl, formatId);
    }
    if (!url_or_none(formatUrl)) {
      if (/^[0-9a-fA-F]+$/.test(formatUrl)) {
        // Hex strings that are too short are expected
      } else {
        this.report_warning(`Skipping format "${formatId}": invalid ciphertext`);
      }
      return null;
    }

    let parsed: URL;
    try {
      parsed = new URL(formatUrl);
    } catch {
      this.report_warning(`Skipping format "${formatId}": unsupported URL format`);
      return null;
    }

    const pathM = parsed.pathname.match(
      new RegExp(String.raw`^/(?<hex>[0-9a-fA-F]{12,})(?<rem>[/,].+)$`),
    );
    const hexString = pathM?.groups?.hex;
    const pathRemainder = pathM?.groups?.rem;
    if (!hexString || pathRemainder == null) {
      this.report_warning(`Skipping format "${formatId}": unsupported URL format`);
      return null;
    }

    const deciphered = this._decipherHexString(hexString, formatId);
    if (!deciphered) return null;

    parsed.pathname = `/${deciphered}${pathRemainder}`;
    return parsed.href;
  }

  protected _fixupFormats(formats: Format[]): Format[] {
    for (const f of formats) {
      if (f.vcodec) continue;
      for (const vcodec of ['av1', 'h264'] as const) {
        if (
          (f.url && f.url.includes(`.${vcodec}.`)) ||
          (typeof f.manifest_url === 'string' && f.manifest_url.includes(`.${vcodec}.`))
        ) {
          f.vcodec = vcodec;
          break;
        }
      }
    }
    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const videoId = mobj.groups!.id || mobj.groups!.id_2!;
    const displayId = mobj.groups!.display_id || mobj.groups!.display_id_2;

    const desktopUrl = url.replace(/^(https?:\/\/(?:.+?\.)?)m\./, '$1');
    // Upstream uses impersonate=True / webpage handle for final Referer; neither is available here.
    const webpage = await this._download_webpage(desktopUrl, videoId);
    const refererUrl = desktopUrl;

    const error = this._html_search_regex(
      /<div[^>]+id=["']videoClosed["'][^>]*>(.+?)<\/div>/,
      webpage,
      'error',
      null,
      false,
    );
    if (error) throw new ExtractorError(error, { expected: true });

    const ageLimit = rtaSearch(webpage);

    const getHeight = (s: string): number | undefined =>
      int_or_none(this._search_regex(/^(\d+)[pP]/, s, 'height', null, false)) ?? undefined;

    const initialsRaw = this._search_regex(
      [
        /window\.initials\s*=\s*({.+?})\s*;\s*<\/script>/,
        /window\.initials\s*=\s*({.+?})\s*;/,
      ],
      webpage,
      'initials',
      '{}',
      false,
    );
    const initials = this._parse_json<Record<string, unknown>>(initialsRaw, videoId, null, false);

    if (initials && initials.videoModel) {
      const video = initials.videoModel as Record<string, unknown>;
      const title = String(video.title || videoId);
      const formats: Format[] = [];
      const formatUrls = new Set<string>();
      const formatSizes: Record<string, number | undefined> = {};
      const sources = (try_get(video, (x) => (x as { sources?: unknown }).sources) as Record<
        string,
        unknown
      >) || {};

      for (const [, formatsDict] of Object.entries(sources)) {
        if (!formatsDict || typeof formatsDict !== 'object' || Array.isArray(formatsDict)) continue;
        const downloadSources =
          (try_get(sources, (x) => (x as { download?: unknown }).download) as Record<
            string,
            unknown
          >) || {};
        for (const [quality, formatDict] of Object.entries(downloadSources)) {
          if (!formatDict || typeof formatDict !== 'object') continue;
          formatSizes[quality] = float_or_none((formatDict as { size?: unknown }).size) ?? undefined;
        }
      }

      for (const [formatId, formatsDict] of Object.entries(sources)) {
        if (!formatsDict || typeof formatsDict !== 'object' || Array.isArray(formatsDict)) continue;
        if (formatId === 'download') continue;
        for (const [quality, formatItem] of Object.entries(formatsDict as Record<string, unknown>)) {
          const formatUrl = url_or_none(formatItem);
          if (!formatUrl || formatUrls.has(formatUrl)) continue;
          formatUrls.add(formatUrl);
          formats.push({
            format_id: `${formatId}-${quality}`,
            url: formatUrl,
            ext: determine_ext(formatUrl, 'mp4'),
            height: getHeight(quality),
            filesize: formatSizes[quality],
            http_headers: { Referer: refererUrl },
          });
        }
      }

      const xplayerSources = try_get(
        initials,
        (x) =>
          ((x as { xplayerSettings?: { sources?: unknown } }).xplayerSettings || {}).sources,
      ) as Record<string, unknown> | undefined;

      if (xplayerSources && typeof xplayerSources === 'object') {
        const hlsSources = xplayerSources.hls;
        if (hlsSources && typeof hlsSources === 'object' && !Array.isArray(hlsSources)) {
          for (const hlsFormatKey of ['url', 'fallback'] as const) {
            const hlsUrlRaw = (hlsSources as Record<string, unknown>)[hlsFormatKey];
            if (typeof hlsUrlRaw !== 'string' || !hlsUrlRaw) continue;
            const hlsUrl = this._decipherFormatUrl(hlsUrlRaw, `hls-${hlsFormatKey}`);
            if (!hlsUrl || formatUrls.has(hlsUrl)) continue;
            formatUrls.add(hlsUrl);
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
        }

        const standardSources = xplayerSources.standard;
        if (standardSources && typeof standardSources === 'object' && !Array.isArray(standardSources)) {
          for (const [identifier, formatsList] of Object.entries(
            standardSources as Record<string, unknown>,
          )) {
            if (!Array.isArray(formatsList)) continue;
            for (const standardFormat of formatsList) {
              if (!standardFormat || typeof standardFormat !== 'object') continue;
              const sf = standardFormat as Record<string, unknown>;
              for (const standardFormatKey of ['url', 'fallback'] as const) {
                const standardUrlRaw = sf[standardFormatKey];
                if (typeof standardUrlRaw !== 'string' || !standardUrlRaw) continue;
                const quality =
                  str_or_none(sf.quality) || str_or_none(sf.label) || '';
                const formatId =
                  [identifier, quality].filter((x) => typeof x === 'string' && x.length).join('-') ||
                  identifier;
                const standardUrl = this._decipherFormatUrl(standardUrlRaw, formatId);
                if (!standardUrl || formatUrls.has(standardUrl)) continue;
                formatUrls.add(standardUrl);
                const ext = determine_ext(standardUrl, 'mp4');
                if (ext === 'm3u8') {
                  formats.push(
                    ...(await this._extract_m3u8_formats(
                      standardUrl,
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
                  continue;
                }
                formats.push({
                  format_id: formatId,
                  url: standardUrl,
                  ext,
                  height: getHeight(quality),
                  filesize: formatSizes[quality],
                  http_headers: { Referer: refererUrl },
                  // HTTP formats return "Wrong key" even when deciphered by site JS
                  __needs_testing: true,
                });
              }
            }
          }
        }
      }

      let categories: string[] | undefined;
      const categoriesList = video.categories;
      if (Array.isArray(categoriesList)) {
        categories = [];
        for (const c of categoriesList) {
          if (!c || typeof c !== 'object') continue;
          const cName = (c as { name?: unknown }).name;
          if (typeof cName === 'string') categories.push(cName);
        }
      }

      const uploaderUrl = url_or_none(
        try_get(video, (x) => (x as { author?: { pageURL?: unknown } }).author?.pageURL),
      );

      return {
        id: videoId,
        display_id: displayId || undefined,
        title,
        description: video.description != null ? String(video.description) : undefined,
        timestamp: int_or_none(video.created) ?? undefined,
        uploader:
          (try_get(
            video,
            (x) => (x as { author?: { name?: unknown } }).author?.name,
            (v): v is string => typeof v === 'string',
          ) as string | null) || undefined,
        uploader_url: uploaderUrl || undefined,
        uploader_id: uploaderUrl ? uploaderUrl.split('/').pop() : undefined,
        thumbnail: video.thumbURL != null ? String(video.thumbURL) : undefined,
        duration: int_or_none(video.duration) ?? undefined,
        view_count: int_or_none(video.views) ?? undefined,
        like_count:
          int_or_none(
            try_get(video, (x) => (x as { rating?: { likes?: unknown } }).rating?.likes),
          ) ?? undefined,
        dislike_count:
          int_or_none(
            try_get(video, (x) => (x as { rating?: { dislikes?: unknown } }).rating?.dislikes),
          ) ?? undefined,
        comment_count: int_or_none(video.comments) ?? undefined,
        age_limit: ageLimit ?? 18,
        categories,
        formats: this._fixupFormats(formats),
        _format_sort_fields: ['res', 'proto:m3u8', 'tbr'],
      };
    }

    // Old layout fallback
    const title =
      this._html_search_regex(
        [
          /<h1[^>]*>([^<]+)<\/h1>/,
          /<meta[^>]+itemprop=".*?caption.*?"[^>]+content="(.+?)"/,
          /<title[^>]*>(.+?)(?:,\s*[^,]*?\s*Porn\s*[^,]*?:\s*xHamster[^<]*| - xHamster\.com)<\/title>/,
        ],
        webpage,
        'title',
      ) || videoId;

    const formats: Format[] = [];
    const formatUrls = new Set<string>();

    const sourcesRaw = this._search_regex(
      /sources\s*:\s*({.+?})\s*,?\s*\n/,
      webpage,
      'sources',
      '{}',
      false,
    );
    const sources = this._parse_json<Record<string, unknown>>(sourcesRaw, videoId, null, false) || {};
    for (const [formatId, formatUrlRaw] of Object.entries(sources)) {
      const formatUrl = url_or_none(formatUrlRaw);
      if (!formatUrl || formatUrls.has(formatUrl)) continue;
      formatUrls.add(formatUrl);
      formats.push({
        format_id: formatId,
        url: formatUrl,
        height: getHeight(formatId),
      });
    }

    const videoUrl = this._search_regex(
      [
        /file\s*:\s*(["'])(?<mp4>.+?)\1/,
        /<a\s+href=(["'])(?<mp4>.+?)\1\s+class=["']mp4Thumb/,
        /<video[^>]+file=(["'])(?<mp4>.+?)\1[^>]*>/,
      ],
      webpage,
      'video url',
      null,
      false,
      'mp4',
    );
    if (videoUrl && !formatUrls.has(videoUrl)) {
      formats.push({ url: videoUrl, format_id: 'http' });
    }

    const descM = webpage.match(/<span>Description: <\/span>([^<]+)/);
    const description = descM?.[1] || undefined;

    const uploadDate = unified_strdate(
      this._search_regex(
        /hint=["'](\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2} [A-Z]{3,4}/,
        webpage,
        'upload date',
        null,
        false,
      ),
    );

    const uploader =
      this._html_search_regex(
        /<span[^>]+itemprop=["']author[^>]+><a[^>]+><span[^>]+>([^<]+)/,
        webpage,
        'uploader',
        'anonymous',
        false,
      ) || 'anonymous';

    const thumbnail = this._search_regex(
      [
        /["']thumbUrl["']\s*:\s*(["'])(?<thumbnail>.+?)\1/,
        /<video[^>]+"poster"=(["'])(?<thumbnail>.+?)\1[^>]*>/,
      ],
      webpage,
      'thumbnail',
      null,
      false,
      'thumbnail',
    );

    const duration = parse_duration(
      this._search_regex(
        [
          /<[^<]+\bitemprop=["']duration["'][^<]+\bcontent=["'](.+?)["']/,
          /Runtime:\s*<\/span>\s*([\d:]+)/,
        ],
        webpage,
        'duration',
        null,
        false,
      ),
    );

    const viewCount = int_or_none(
      this._search_regex(
        /content=["']User(?:View|Play)s:(\d+)/,
        webpage,
        'view count',
        null,
        false,
      ),
    );

    const likeM = webpage.match(
      /hint=['"](?<likecount>\d+) Likes \/ (?<dislikecount>\d+) Dislikes/,
    );
    const likeCount = likeM?.groups?.likecount;
    const dislikeCount = likeM?.groups?.dislikecount;

    const commentM = webpage.match(/<\/label>Comments \((?<commentcount>\d+)\)<\/div>/);
    const commentCount = commentM?.groups?.commentcount ?? '0';

    const categoriesHtml = this._search_regex(
      /<table[\s\S]+?(<span>Categories:[\s\S]+?)<\/table>/,
      webpage,
      'categories',
      null,
      false,
    );
    const categories = categoriesHtml
      ? [...categoriesHtml.matchAll(/<a[^>]+>(.+?)<\/a>/g)]
          .map((m) => clean_html(m[1]))
          .filter((c): c is string => !!c)
      : undefined;

    return {
      id: videoId,
      display_id: displayId || undefined,
      title,
      description,
      upload_date: uploadDate || undefined,
      uploader,
      uploader_id: uploader ? uploader.toLowerCase() : undefined,
      thumbnail: thumbnail || undefined,
      duration: duration ?? undefined,
      view_count: viewCount ?? undefined,
      like_count: int_or_none(likeCount) ?? undefined,
      dislike_count: int_or_none(dislikeCount) ?? undefined,
      comment_count: int_or_none(commentCount) ?? undefined,
      age_limit: ageLimit ?? undefined,
      categories,
      formats,
    };
  }
}

export class XHamsterEmbedIE extends InfoExtractor {
  static IE_NAME = 'XHamsterEmbed';
  static _VALID_URL = new RegExp(
    String.raw`https?://(?:[^/?#]+\.)?${XH_DOMAINS}/xembed\.php\?video=(?<id>\d+)`,
  );
  static _EMBED_REGEX = [
    /<iframe[^>]+?src=(["'])(?<url>(?:https?:)?\/\/(?:www\.)?xhamster\.com\/xembed\.php\?video=\d+)\1/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    let videoUrl = this._search_regex(
      new RegExp(
        String.raw`href="(https?://xhamster\.com/(?:movies/${videoId}/[^"]*\.html|videos/[^/]*-${videoId})[^"]*)"`,
      ),
      webpage,
      'xhamster url',
      null,
      false,
    );

    if (!videoUrl) {
      const playerVars = this._parse_json<Record<string, unknown>>(
        this._search_regex(/vars\s*:\s*({.+?})\s*,\s*\n/, webpage, 'vars')!,
        videoId,
      )!;
      videoUrl = dict_get(playerVars, [
        'downloadLink',
        'homepageLink',
        'commentsLink',
        'shareUrl',
      ]) as string | null;
    }

    return this.url_result(videoUrl || url, 'XHamster');
  }
}

export class XHamsterUserIE extends InfoExtractor {
  static IE_NAME = 'XHamsterUser';
  static _VALID_URL = new RegExp(
    String.raw`https?://(?:[^/?#]+\.)?${XH_DOMAINS}/(?:(?<user>users)|creators)/(?<id>[^/?#&]+)`,
  );

  protected async *_entries(userId: string, isUser: boolean): AsyncGenerator<VideoInfo> {
    const prefix = isUser ? 'users' : 'creators';
    const suffix = isUser ? 'videos' : 'exclusive';
    let nextPageUrl: string | null = `https://xhamster.com/${prefix}/${userId}/${suffix}/1`;
    for (let pagenum = 1; nextPageUrl; pagenum++) {
      const page = await this._download_webpage(
        nextPageUrl,
        userId,
        `Downloading page ${pagenum}`,
      );
      for (const videoTag of page.matchAll(
        /(<a[^>]+class=["'].*?\bvideo-thumb__image-container[^>]+>)/g,
      )) {
        const video = extract_attributes(videoTag[1] || '');
        const videoUrl = url_or_none(video.href);
        if (!videoUrl || !XHamsterIE.suitable(videoUrl)) continue;
        const m = videoUrl.match(XHamsterIE._VALID_URL);
        const vid = m?.groups?.id || m?.groups?.id_2;
        yield this.url_result(videoUrl, XHamsterIE.IE_NAME, vid || undefined);
      }
      const nextM = page.match(/<a[^>]+data-page=["']next[^>]+>/);
      if (!nextM) break;
      const nextPage = extract_attributes(nextM[0]!);
      nextPageUrl = url_or_none(nextPage.href);
      if (!nextPageUrl) break;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const user = m.groups!.user;
    const userId = m.groups!.id!;
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(userId, Boolean(user))) entries.push(e);
    return this.playlist_result(entries, userId);
  }
}

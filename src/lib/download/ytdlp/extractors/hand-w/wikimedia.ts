// @ts-nocheck
/** WikimediaIE â€?ported from yt-dlp wikimedia.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  float_or_none,
  int_or_none,
  mimetype2ext,
  parse_codecs,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { parse_iso8601 } from './_helpers';

const YT_DLP_UA = 'yt-dlp/reader (https://github.com/yt-dlp/yt-dlp)';

export class WikimediaIE extends InfoExtractor {
  static IE_NAME = 'wikimedia.org';
  static _VALID_URL = /https?:\/\/commons\.wikimedia\.org\/wiki\/File:(?<id>[^/#?]+)/;
  static _HTTP_HEADERS = {
    // Faking a browser UA leads to 403; follow Wikimedia robot policy.
    'User-Agent': YT_DLP_UA,
  };

  protected static _parseExtAndCodecs(s: string | null | undefined): Partial<Format> {
    if (!s) return {};
    const mobj = /(?<mime>[^;]+)(?:;\s*codecs="(?<codecs>[^"]+)")?/.exec(s);
    if (!mobj?.groups) return {};
    return {
      ext: mimetype2ext(mobj.groups.mime) || undefined,
      ...parse_codecs(mobj.groups.codecs),
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const apiJson = await this._download_json<Record<string, unknown>>(
      'https://commons.wikimedia.org/w/api.php',
      displayId,
      undefined,
      {
        query: {
          action: 'query',
          format: 'json',
          titles: `File:${decodeURIComponent(displayId)}`,
          prop: 'videoinfo',
          viprop: 'timestamp|user|url|size|derivatives|timedtext|extmetadata',
        },
        headers: WikimediaIE._HTTP_HEADERS,
      },
    );

    const pages = traverse_obj(apiJson, ['query', 'pages']) as
      | Record<string, Record<string, unknown>>
      | Array<Record<string, unknown>>
      | undefined;
    let apiResponse: Record<string, unknown> | undefined;
    if (Array.isArray(pages)) {
      apiResponse = pages[0];
    } else if (pages && typeof pages === 'object') {
      apiResponse = Object.values(pages)[0];
    }
    if (!apiResponse) {
      throw new ExtractorError('Unable to extract video info', { expected: true });
    }

    const videoInfo = ((apiResponse.videoinfo as unknown[]) || [])[0] as
      | Record<string, unknown>
      | undefined;
    if (!videoInfo) {
      throw new ExtractorError('Unable to extract video info', { expected: true });
    }

    const formats: Format[] = [];
    if (url_or_none(videoInfo.url)) {
      formats.push({
        url: String(videoInfo.url),
        format_id: 'source',
        quality: 10,
        width: int_or_none(videoInfo.width) ?? undefined,
        height: int_or_none(videoInfo.height) ?? undefined,
        filesize: int_or_none(videoInfo.size) ?? undefined,
        http_headers: WikimediaIE._HTTP_HEADERS,
      });
    }

    for (const derivative of (videoInfo.derivatives as Array<Record<string, unknown>>) || []) {
      const src = url_or_none(derivative.src);
      if (!src) continue;
      formats.push({
        url: src,
        format_id: String(derivative.width || derivative.height || formats.length),
        width: int_or_none(derivative.width) ?? undefined,
        height: int_or_none(derivative.height) ?? undefined,
        tbr: int_or_none(derivative.bandwidth, 1000) ?? undefined,
        http_headers: WikimediaIE._HTTP_HEADERS,
        ...WikimediaIE._parseExtAndCodecs(derivative.type as string | undefined),
      });
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const subtitle of (videoInfo.timedtext as Array<Record<string, unknown>>) || []) {
      const src = url_or_none(subtitle.src);
      if (!src) continue;
      const lang = (subtitle.srclang as string) || 'unk';
      if (!subtitles[lang]) subtitles[lang] = [];
      subtitles[lang]!.push({
        url: src,
        ext: mimetype2ext(subtitle.type as string | undefined) || undefined,
        http_headers: WikimediaIE._HTTP_HEADERS,
      });
    }

    const extMeta = (videoInfo.extmetadata as Record<string, Record<string, unknown>>) || {};
    const categoriesRaw = extMeta.Categories?.value;
    const categories =
      typeof categoriesRaw === 'string'
        ? categoriesRaw
            .split('|')
            .map((x) => x.trim())
            .filter(Boolean)
        : undefined;

    return {
      id: str_or_none(apiResponse.pageid) || displayId,
      display_id: displayId,
      formats,
      subtitles,
      title: str_or_none(extMeta.ObjectName?.value) || displayId,
      timestamp: parse_iso8601(videoInfo.timestamp) ?? undefined,
      description: clean_html(String(extMeta.ImageDescription?.value ?? '')) || undefined,
      uploader: str_or_none(videoInfo.user) || undefined,
      duration: float_or_none(videoInfo.duration) ?? undefined,
      license: str_or_none(extMeta.UsageTerms?.value) || undefined,
      categories,
    };
  }
}

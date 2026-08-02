/**
 * EpornerIE — ported from yt-dlp eporner.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  get_elements_by_class,
  int_or_none,
  join_nonempty,
  merge_dicts,
  parse_duration,
  str_to_int,
  url_or_none,
} from '../../utils';

function encodeBaseN(num: number, base: number): string {
  const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
  if (num === 0) return '0';
  let n = num;
  let out = '';
  while (n > 0) {
    out = digits[n % base]! + out;
    n = Math.floor(n / base);
  }
  return out;
}

function calcHash(vidHash: string): string {
  return [0, 8, 16, 24]
    .map((lb) => encodeBaseN(parseInt(vidHash.slice(lb, lb + 8), 16), 36))
    .join('');
}

export class EpornerIE extends InfoExtractor {
  static IE_NAME = 'eporner';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?eporner\.com\/(?:(?:hd-porn|embed)\/|video-)(?<id>\w+)(?:\/(?<display_id>[\w-]+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    let videoId = mobj.groups!.id!;
    let displayId = mobj.groups!.display_id || videoId;

    const handle = await this._request_webpage(url, displayId, undefined, {
      headers: this.geo_verification_headers(),
    });
    const webpage = handle?.text ?? (await this._download_webpage(url, displayId));
    if (handle?.url) {
      const idMatch = handle.url.match(/(?:hd-porn|embed|video-)(?<id>\w+)/);
      if (idMatch?.groups?.id) videoId = idMatch.groups.id;
    }

    const vidHash = this._search_regex(/hash\s*[:=]\s*["']([\da-f]{32})/, webpage, 'hash')!;
    const title =
      this._og_search_title(webpage, false) ||
      this._search_regex(/<title>(.+?) - EPORNER/, webpage, 'title') ||
      displayId;

    const video = await this._download_json<Record<string, unknown>>(
      `http://www.eporner.com/xhr/video/${videoId}`,
      displayId,
      'Downloading video JSON',
      {
        query: {
          hash: calcHash(vidHash),
          device: 'generic',
          domain: 'www.eporner.com',
          fallback: 'false',
        },
      },
    );

    if (video.available === false) {
      throw new ExtractorError(`${this.IE_NAME} said: ${String(video.message ?? 'unavailable')}`, {
        expected: true,
      });
    }

    const sources = (video.sources as Record<string, unknown>) || {};
    const formats: Format[] = [];
    const hasAv1 = get_elements_by_class('download-av1', webpage).length > 0;

    for (const [kind, formatsDict] of Object.entries(sources)) {
      if (!formatsDict || typeof formatsDict !== 'object') continue;
      for (const [formatId, formatDictRaw] of Object.entries(formatsDict as Record<string, unknown>)) {
        if (!formatDictRaw || typeof formatDictRaw !== 'object') continue;
        const formatDict = formatDictRaw as Record<string, unknown>;
        const src = url_or_none(formatDict.src);
        if (!src || !src.startsWith('http')) continue;
        if (kind === 'hls') {
          formats.push(
            ...(await this._extract_m3u8_formats(
              src,
              displayId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              kind,
              undefined,
              false,
            )),
          );
        } else {
          const height = int_or_none(this._search_regex(/(\d+)[pP]/, formatId, 'height', null, false)) ?? undefined;
          const fps = int_or_none(this._search_regex(/(\d+)fps/, formatId, 'fps', null, false)) ?? undefined;
          formats.push({ url: src, format_id: formatId, height, fps });
          if (hasAv1) {
            formats.push({
              url: src.replace('.mp4', '-av1.mp4'),
              format_id: join_nonempty('av1', formatId),
              height,
              fps,
              vcodec: 'av1',
            });
          }
        }
      }
    }

    const jsonLd = this._search_json_ld(webpage, displayId, { fatal: false });
    const duration = parse_duration(this._html_search_meta('duration', webpage, undefined, false)) ?? undefined;
    const viewCount =
      str_to_int(
        this._search_regex(/id=["']cinemaviews1["'][^>]*>\s*([0-9,]+)/, webpage, 'view count', null, false),
      ) ?? undefined;

    return merge_dicts(jsonLd, {
      id: videoId,
      display_id: displayId,
      title,
      duration,
      view_count: viewCount,
      formats,
      age_limit: 18,
    }) as VideoInfo;
  }
}

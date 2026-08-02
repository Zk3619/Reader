/**
 * TxxxIE / PornTopIE — ported from yt-dlp txxx.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, js_to_json, parse_duration, traverse_obj, url_or_none } from '../../utils';
import { urljoin } from './_helpers';

const DOMAINS = [
  'hclips.com',
  'hdzog.com',
  'hdzog.tube',
  'hotmovs.com',
  'hotmovs.tube',
  'inporn.com',
  'privatehomeclips.com',
  'tubepornclassic.com',
  'txxx.com',
  'txxx.tube',
  'upornia.com',
  'upornia.tube',
  'vjav.com',
  'vjav.tube',
  'vxxx.com',
  'voyeurhit.com',
  'voyeurhit.tube',
];

function decodeBase64(text: string): string {
  const map: Record<string, string> = {
    '\u0405': 'S',
    '\u0406': 'I',
    '\u0408': 'J',
    '\u0410': 'A',
    '\u0412': 'B',
    '\u0415': 'E',
    '\u041a': 'K',
    '\u041c': 'M',
    '\u041d': 'H',
    '\u041e': 'O',
    '\u0420': 'P',
    '\u0421': 'C',
    '\u0425': 'X',
    ',': '/',
    '.': '+',
    '~': '=',
  };
  const normalized = [...text].map((ch) => map[ch] ?? ch).join('');
  return atob(normalized);
}

function getFormats(host: string, videoFile: unknown): Format[] {
  if (!Array.isArray(videoFile)) return [];
  return videoFile
    .map((video, index) => {
      if (!video || typeof video !== 'object') return null;
      const rec = video as Record<string, unknown>;
      const encoded = rec.video_url;
      if (!encoded) return null;
      let decoded: string;
      try {
        decoded = decodeBase64(String(encoded));
      } catch {
        return null;
      }
      const formatRaw = Array.isArray(rec.format) ? rec.format[0] : rec.format;
      return {
        url: urljoin(`https://${host}`, decoded),
        format_id: formatRaw != null ? String(formatRaw).replace(/^_/, '') : `format-${index}`,
        quality: index,
      } as Format;
    })
    .filter(Boolean) as Format[];
}

export class TxxxIE extends InfoExtractor {
  static _VALID_URL = new RegExp(
    `https?:\\/\\/(?:www\\.)?(?<host>${DOMAINS.map((d) => d.replace(/\./g, '\\.')).join('|')})\\/(?:videos?[/-]|embed\\/)(?<id>\\d+)(?:\\/(?<display_id>[^/?#]+))?`,
  );

  protected async _callApi(url: string, videoId: string, fatal = false, headers?: Record<string, string>) {
    const content = await this._download_json<Record<string, unknown>>(url, videoId, undefined, {
      headers,
      fatal,
    });
    if (content?.error) {
      throw new ExtractorError(`Txxx said: ${content.error}`, { expected: true });
    }
    return content || {};
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const host = m.groups!.host!;
    const displayId = m.groups!.display_id;
    const headers = { Referer: url, 'X-Requested-With': 'XMLHttpRequest' };

    const videoFile = await this._callApi(
      `https://${host}/api/videofile.php?video_id=${videoId}&lifetime=8640000`,
      videoId,
      true,
      headers,
    );

    const slug = `${Math.trunc(Number(videoId) / 1e6) * 1e6}/${Math.trunc(Number(videoId) / 1000) * 1000}`;
    const videoInfo = await this._callApi(
      `https://${host}/api/json/video/86400/${slug}/${videoId}.json`,
      videoId,
      false,
      headers,
    );

    return {
      id: videoId,
      display_id: displayId || undefined,
      title: traverse_obj(videoInfo, ['video', 'title']) != null ? String(traverse_obj(videoInfo, ['video', 'title'])) : undefined,
      uploader:
        traverse_obj(videoInfo, ['video', 'user', 'username']) != null
          ? String(traverse_obj(videoInfo, ['video', 'user', 'username']))
          : undefined,
      duration: parse_duration(traverse_obj(videoInfo, ['video', 'duration'])) ?? undefined,
      view_count: int_or_none(traverse_obj(videoInfo, ['video', 'statistics', 'viewed'])) ?? undefined,
      like_count: int_or_none(traverse_obj(videoInfo, ['video', 'statistics', 'likes'])) ?? undefined,
      dislike_count: int_or_none(traverse_obj(videoInfo, ['video', 'statistics', 'dislikes'])) ?? undefined,
      age_limit: 18,
      thumbnail: url_or_none(traverse_obj(videoInfo, ['video', 'thumbsrc'])) || undefined,
      formats: getFormats(host, videoFile),
    };
  }
}

export class PornTopIE extends InfoExtractor {
  static _VALID_URL = /https?:\/\/(?<host>(?:www\.)?porntop\.com)\/video\/(?<id>\d+)(?:\/(?<display_id>[^/?]+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const host = m.groups!.host!;
    const displayId = m.groups!.display_id;
    const webpage = await this._download_webpage(url, videoId);

    const jsonLd = (this._search_json<Record<string, unknown>>(/\bschemaJson\s*=/, webpage, 'JSON-LD', videoId, {
      transform_source: js_to_json,
      fatal: false,
      default: {},
    }) || {}) as Partial<VideoInfo>;

    const b64 = this._search_regex(
      /window\.initPlayer\(.*}}},\s*'(?<json_b64c>[^']+)'/,
      webpage,
      'json_urls',
      null,
      false,
      'json_b64c',
    );
    const videoFile = b64 ? this._parse_json<unknown>(decodeBase64(b64), videoId) : [];

    return {
      ...jsonLd,
      id: videoId,
      display_id: displayId || undefined,
      age_limit: 18,
      formats: getFormats(host.replace(/^www\./, ''), videoFile),
    };
  }
}

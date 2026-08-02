/**
 * IvooxIE — ported from yt-dlp ivoox.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  js_to_json,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { parseIso8601, urljoin } from './_helpers';

function searchNuxtAudio(
  ie: InfoExtractor,
  webpage: string,
  mediaId: string,
): Record<string, unknown> {
  const fnRe =
    /\(function\((?<arg_keys>[^)]*)\)\{[\s\S]*?\breturn\s+(?<js>\{[\s\S]*?\})\s*;?\s*\}\((?<arg_vals>[\s\S]*?)\)\s*\)/;
  const patterns = [
    new RegExp(`<script>\\s*window\\.__NUXT__=${fnRe.source}\\s*;?\\s*<\\/script>`, 'i'),
    new RegExp(`__NUXT__\\([\\s\\S]*?${fnRe.source}`, 'i'),
  ];
  for (const re of patterns) {
    const m = webpage.match(re);
    if (!m?.groups?.js) continue;
    const argsList = ie._parse_json(`[${m.groups.arg_vals}]`, mediaId, js_to_json, false) as unknown[] | null;
    const argKeys = m.groups.arg_keys.split(',').map((k) => k.trim());
    const argMap: Record<string, unknown> = {};
    argKeys.forEach((k, i) => {
      if (k) argMap[k] = argsList?.[i];
    });
    const payload = ie._parse_json(
      m.groups.js.replace(/\b(\w+)\b/g, (name) => (name in argMap ? JSON.stringify(argMap[name]) : name)),
      mediaId,
      null,
      false,
    ) as Record<string, unknown> | null;
    const audio = traverse_obj(payload, ['data', 0, 'data', 'audio']);
    if (audio && typeof audio === 'object') return audio as Record<string, unknown>;
  }
  return {};
}

export class IvooxIE extends InfoExtractor {
  static IE_NAME = 'ivoox';
  static _VALID_URL = [
    /https?:\/\/(?:www\.)?ivoox\.com\/(?:\w{2}\/)?[^/?#]+_rf_(?<id>[0-9]+)_1\.html/,
    /https?:\/\/go\.ivoox\.com\/rf\/(?<id>[0-9]+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const mediaId = this._match_id(url);
    const webpage = await this._download_webpage(url, mediaId, undefined, { fatal: false }) || '';
    const data = searchNuxtAudio(this, webpage, mediaId);

    const directDownload = await this._download_json<Record<string, unknown>>(
      `https://vcore-web.ivoox.com/v1/public/audios/${mediaId}/download-url`,
      mediaId,
      undefined,
      { fatal: false, headers: { Referer: url } },
    );

    const downloadPaths = new Set<string>();
    const downloadUrl = traverse_obj(directDownload, ['data', 'downloadUrl']);
    if (typeof downloadUrl === 'string') downloadPaths.add(downloadUrl);
    else if (Array.isArray(downloadUrl)) {
      for (const p of downloadUrl) {
        if (typeof p === 'string') downloadPaths.add(p);
      }
    }
    for (const key of ['downloadUrl', 'mediaUrl'] as const) {
      const v = data[key];
      if (typeof v === 'string') downloadPaths.add(v);
    }

    const formats: Format[] = [...downloadPaths].map((path, i) => ({
      format_id: i === 0 ? 'http' : `http-${i}`,
      url: urljoin('https://ivoox.com', path),
      http_headers: { Referer: url },
    }));

    const jsonLd = this._search_json_ld(webpage, mediaId, { fatal: false }) || {};
    const nuxtMeta: Partial<VideoInfo> = {
      title: traverse_obj(data, ['title']) as string | undefined,
      description: traverse_obj(data, ['description']) as string | undefined,
      thumbnail: url_or_none(traverse_obj(data, ['image'])) ?? undefined,
      timestamp:
        parseIso8601(
          String(traverse_obj(data, ['uploadDate']) ?? '').replace(' ', 'T') || null,
        ) ?? undefined,
      duration: int_or_none(traverse_obj(data, ['duration'])) ?? undefined,
      tags: ((data.tags as Array<Record<string, unknown>>) || [])
        .map((t) => (t.name != null ? String(t.name) : ''))
        .filter(Boolean),
    };

    return {
      id: mediaId,
      formats,
      uploader:
        this._html_search_regex(/data-prm-author="([^"]+)"/, webpage, 'author', null, false) || undefined,
      timestamp:
        parseIso8601(
          this._html_search_regex(/data-prm-pubdate="([^"]+)"/, webpage, 'timestamp', null, false),
        ) ?? undefined,
      channel:
        this._html_search_regex(/data-prm-podname="([^"]+)"/, webpage, 'channel', null, false) || undefined,
      title:
        this._html_search_regex(/data-prm-title="([^"]+)"/, webpage, 'title', null, false) || undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      description: this._og_search_description(webpage) ?? undefined,
      ...jsonLd,
      ...nuxtMeta,
    };
  }
}

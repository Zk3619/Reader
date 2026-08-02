/**
 * AmadeusTVIE — aligned with yt-dlp amadeustv.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  js_to_json,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';

const REFERER = 'http://www.amadeus.tv/';

function parseIso8601(dateStr: unknown): number | null {
  if (dateStr == null) return null;
  const t = Date.parse(String(dateStr));
  return Number.isFinite(t) ? Math.trunc(t / 1000) : null;
}

function searchNuxtData(
  ie: InfoExtractor,
  webpage: string,
  videoId: string,
  traverse: Array<string | number> = ['fetch', 0],
): Record<string, unknown> {
  const fnRe =
    /\(function\((?<arg_keys>[^)]*)\)\{[\s\S]*?\breturn\s+(?<js>\{[\s\S]*?\})\s*;?\s*\}\((?<arg_vals>[\s\S]*?)\)\s*\)/;
  const patterns = [
    new RegExp(`<script>\\s*window\\.__NUXT__=${fnRe.source}\\s*;?\\s*<\\/script>`, 'i'),
    new RegExp(`__NUXT__\\([\\s\\S]*?${fnRe.source}`, 'i'),
  ];
  let js: string | null = null;
  let argKeys = '';
  let argVals = '';
  for (const re of patterns) {
    const m = webpage.match(re);
    if (m?.groups) {
      js = m.groups.js || null;
      argKeys = m.groups.arg_keys || '';
      argVals = m.groups.arg_vals || '';
      break;
    }
  }
  if (!js) return {};

  const argsList = ie._parse_json(`[${argVals}]`, videoId, js_to_json, false) as unknown[] | null;
  const args: Record<string, string> = {};
  argKeys.split(',').forEach((key, idx) => {
    const k = key.trim();
    if (!k) return;
    args[k] = JSON.stringify(argsList?.[idx] ?? null);
  });

  const substituted = js.replace(/(\w+)/g, (token) =>
    token in args ? String(JSON.parse(args[token]!)) : token,
  );
  const parsed = ie._parse_json(substituted, videoId, null, false) as Record<string, unknown>;
  return (traverse_obj(parsed, traverse) as Record<string, unknown>) || {};
}

export class AmadeusTVIE extends InfoExtractor {
  static IE_NAME = 'amadeustv';
  static _VALID_URL = /https?:\/\/(?:www\.)?amadeus\.tv\/library\/(?<id>[\da-f]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const nuxtData = searchNuxtData(this, webpage, displayId);
    const videoId = str_or_none(traverse_obj(nuxtData, ['item', 'video']));
    if (!videoId) {
      throw new ExtractorError('Unable to extract actual video ID', { expected: true });
    }

    const videoData = await this._download_json<Record<string, unknown>>(
      `http://playvideo.qcloud.com/getplayinfo/v2/1253584441/${videoId}`,
      videoId,
      undefined,
      { headers: { Referer: REFERER } },
    );

    const formats: Format[] = [];
    const videoNodes = traverse_obj(
      videoData,
      ['videoInfo', 'sourceVideo', 'transcodeList'],
      { get_all: true },
    ) as Record<string, unknown>[] | undefined;
    const sourceVideo = traverse_obj(videoData, ['videoInfo', 'sourceVideo']) as
      | Record<string, unknown>
      | undefined;
    const allVideos = [
      ...(sourceVideo ? [sourceVideo] : []),
      ...(Array.isArray(videoNodes) ? videoNodes : []),
    ];

    for (const video of allVideos) {
      if (!url_or_none(video.url)) continue;
      const definition = String(video.definition || '0');
      formats.push({
        url: String(video.url),
        format_id: `http-${definition || '0'}`,
        width: int_or_none(video.width),
        height: int_or_none(video.height),
        filesize: int_or_none(video.totalSize) ?? int_or_none(video.size),
        vcodec: traverse_obj(video, ['videoStreamList', 0, 'codec']) as string | undefined,
        acodec: traverse_obj(video, ['audioStreamList', 0, 'codec']) as string | undefined,
        fps: float_or_none(traverse_obj(video, ['videoStreamList', 0, 'fps'])),
        http_headers: { Referer: REFERER },
      });
    }

    const titleFromApi = str_or_none(traverse_obj(videoData, ['videoInfo', 'basicInfo', 'name']));
    const titleFromNuxt =
      str_or_none(traverse_obj(nuxtData, ['item', 'title'])) ||
      str_or_none(traverse_obj(nuxtData, ['item', 'title_en'])) ||
      str_or_none(traverse_obj(nuxtData, ['item', 'title_cn']));

    return {
      id: videoId,
      display_id: displayId,
      formats,
      title: titleFromNuxt || titleFromApi || displayId,
      thumbnail:
        url_or_none(traverse_obj(videoData, ['coverInfo', 'coverUrl'])) || undefined,
      duration:
        float_or_none(traverse_obj(videoData, ['videoInfo', 'sourceVideo', 'floatDuration'])) ??
        float_or_none(traverse_obj(videoData, ['videoInfo', 'sourceVideo', 'duration'])),
      description:
        str_or_none(traverse_obj(nuxtData, ['item', 'description'])) ||
        str_or_none(traverse_obj(nuxtData, ['item', 'description_en'])) ||
        str_or_none(traverse_obj(nuxtData, ['item', 'description_cn'])) ||
        null,
      timestamp: parseIso8601(traverse_obj(nuxtData, ['item', 'date'])),
      view_count: int_or_none(traverse_obj(nuxtData, ['item', 'view'])),
      webpage_url: url,
      original_url: url,
      extractor: 'amadeustv',
      extractor_key: 'AmadeusTV',
      http_headers: { Referer: REFERER },
    };
  }
}

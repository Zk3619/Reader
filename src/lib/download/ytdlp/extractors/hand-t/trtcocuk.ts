/**
 * TrtCocukVideoIE — ported from yt-dlp trtcocuk.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, htmlExtractTitle, parseIso8601 } from './_helpers';

function searchNuxtData(
  ie: InfoExtractor,
  webpage: string,
  videoId: string,
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

  const argsList = ie._parse_json(`[${argVals}]`, videoId, null, false) as unknown[] | null;
  const args: Record<string, string> = {};
  argKeys.split(',').forEach((key, idx) => {
    const k = key.trim();
    if (!k) return;
    args[k] = JSON.stringify(argsList?.[idx] ?? null);
  });

  const substituted = js.replace(/\w+/g, (token) =>
    token in args ? String(JSON.parse(args[token]!)) : token,
  );
  const parsed = ie._parse_json(substituted, videoId, null, false) as Record<string, unknown>;
  return (traverse_obj(parsed, ['data']) as Record<string, unknown>) || {};
}

export class TrtCocukVideoIE extends InfoExtractor {
  static IE_NAME = 'trtcocuk';
  static _VALID_URL = /https?:\/\/www\.trtcocuk\.net\.tr\/video\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const nuxtjsData = searchNuxtData(this, webpage, displayId);

    let videoUrl: unknown;
    try {
      videoUrl = this._parse_json(String(nuxtjsData.video), displayId);
    } catch {
      videoUrl = nuxtjsData.video;
    }

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      String(videoUrl),
      displayId,
    );

    return {
      id: String(nuxtjsData.id),
      formats,
      subtitles,
      season_number: int_or_none(nuxtjsData.season) ?? undefined,
      release_timestamp: parseIso8601(nuxtjsData.publishedDate as string) ?? undefined,
      series: traverse_obj(nuxtjsData, ['show', 0, 'title']) as string | undefined,
      title: htmlExtractTitle(webpage) || displayId,
    };
  }
}

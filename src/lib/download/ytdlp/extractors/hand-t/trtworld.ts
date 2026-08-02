/** TrtWorldIE — ported from yt-dlp trtworld.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

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
  return (ie._parse_json(substituted, videoId, null, false) as Record<string, unknown>) || {};
}

function platformField(
  platforms: Record<string, unknown>,
  path: string[],
): unknown {
  for (const key of ['website', 'ott']) {
    let cur: unknown = platforms[key];
    for (const segment of path) {
      if (!cur || typeof cur !== 'object') {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[segment];
    }
    if (cur != null) return cur;
  }
  return undefined;
}

export class TrtWorldIE extends InfoExtractor {
  static _VALID_URL = /https?:\/\/www\.trtworld\.com\/video\/[\w-]+\/[\w-]+-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const nuxtRoot = searchNuxtData(this, webpage, displayId);
    const nuxtjsData = traverse_obj(nuxtRoot, ['videoData', 'content', 'platforms']) as Record<
      string,
      unknown
    >;

    const formats: Format[] = [];
    for (const platformKey of ['website', 'ott']) {
      const metadata = traverse_obj(nuxtjsData, [platformKey, 'metadata']) as
        | Record<string, unknown>
        | undefined;
      if (!metadata) continue;
      for (const mediaKey of ['hls_url', 'url']) {
        const mediaUrl = url_or_none(metadata[mediaKey]);
        if (!mediaUrl) continue;
        if (determine_ext(mediaUrl) === 'm3u8') {
          formats.push(
            ...(await this._extract_m3u8_formats(mediaUrl, displayId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
          );
        } else {
          formats.push({ format_id: 'http', url: mediaUrl });
        }
      }
    }

    if (!formats.length) {
      const youtubeId = traverse_obj(nuxtjsData, ['youtube', 'metadata', 'youtubeId']);
      if (youtubeId) return this.url_result(String(youtubeId), 'Youtube');
      throw new ExtractorError('No video found', { expected: true });
    }

    const title = platformField(nuxtjsData, ['fields', 'title', 'text']);
    const description = platformField(nuxtjsData, ['fields', 'description', 'text']);
    const thumbnail = url_or_none(platformField(nuxtjsData, ['fields', 'thumbnail', 'url']));
    const releaseTimestamp = parseIso8601(
      platformField(nuxtjsData, ['published', 'date']) as string,
    );

    return {
      id: displayId,
      formats,
      title: title ? String(title) : undefined,
      description: description ? String(description) : undefined,
      thumbnail: thumbnail ?? undefined,
      release_timestamp: releaseTimestamp ?? undefined,
    };
  }
}

// @ts-nocheck
/**
 * ViouslyIE â€?ported from yt-dlp viously.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  extract_attributes,
  int_or_none,
  traverse_obj,
  unified_timestamp,
} from '../../utils';

const STANDARD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const CUSTOM_ALPHABET = 'VIOUSLYABCDEFGHJKMNPQRTWXZviouslyabcdefghjkmnpqrtwxz9876543210+/=';

function customDecode(text: string): string {
  let translated = '';
  for (const ch of text) {
    const i = CUSTOM_ALPHABET.indexOf(ch);
    translated += i >= 0 ? STANDARD_ALPHABET[i]! : ch;
  }
  try {
    const binary = atob(translated);
    return binary.replace(/\0+$/g, '');
  } catch {
    return '';
  }
}

export class ViouslyIE extends InfoExtractor {
  static IE_NAME = 'viously';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ViouslyIE is not a standalone extractor', { expected: true });
  }

  async _extractFromWebpage(_url: string, webpage: string): Promise<VideoInfo[]> {
    const players = [
      ...webpage.matchAll(/<div[^>]*class="(?:[^"]*\s)?v(?:iou)?sly-player(?:\s[^"]*)?"[^>]*>/gi),
    ].map((m) => m[0]!);
    if (!players.length) return [];

    const results: VideoInfo[] = [];
    for (const tag of players) {
      const videoId = extract_attributes(tag).id;
      if (!videoId) continue;

      const formats = await this._extract_m3u8_formats(
        `https://www.viously.com/video/hls/${videoId}/index.m3u8`,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        undefined,
        undefined,
        false,
      );
      if (!formats.length) continue;

      let data: Record<string, unknown> = {};
      try {
        const raw = await this._download_webpage(
          `https://www.viously.com/export/json/${videoId}`,
          videoId,
          undefined,
          { fatal: false },
        );
        if (raw) {
          data = (this._parse_json<Record<string, unknown>>(customDecode(raw), videoId, undefined, false) ||
            {}) as Record<string, unknown>;
        }
      } catch {
        /* ignore metadata failures */
      }

      const video = (data.video as Record<string, unknown>) || {};
      const categoryName = traverse_obj(video, ['category', 'name']);
      results.push({
        id: videoId,
        formats: formats as Format[],
        title: typeof video.title === 'string' ? video.title : videoId,
        description: typeof video.description === 'string' ? video.description : undefined,
        duration: int_or_none(video.duration) ?? undefined,
        timestamp: unified_timestamp(video.iso_date) ?? undefined,
        categories: typeof categoryName === 'string' && categoryName ? [categoryName] : undefined,
      });
    }
    return results;
  }
}

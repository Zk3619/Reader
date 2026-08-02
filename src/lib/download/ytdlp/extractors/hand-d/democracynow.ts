/**
 * DemocracynowIE — ported from yt-dlp democracynow.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { remove_start } from '../../utils';
import { urlBasename } from './_helpers';

export class DemocracynowIE extends InfoExtractor {
  static IE_NAME = 'democracynow';
  static _VALID_URL = /https?:\/\/(?:www\.)?democracynow\.org\/(?<id>[^\?]*)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const jsonData = this._parse_json<Record<string, unknown>>(
      this._search_regex(/<script[^>]+type="text\/json"[^>]*>\s*({[^>]+})/, webpage, 'json')!,
      displayId,
    )!;

    const title = String(jsonData.title ?? '');
    const formats: Format[] = [];
    let videoId: string | null = null;

    for (const key of ['file', 'audio', 'video', 'high_res_video'] as const) {
      let mediaUrl = String(jsonData[key] ?? '');
      if (!mediaUrl) continue;
      mediaUrl = mediaUrl.replace(/\?.*$/, '');
      try {
        mediaUrl = new URL(mediaUrl, url).href;
      } catch {
        /* keep */
      }
      const base = urlBasename(mediaUrl).replace(/\.[^.]+$/, '');
      videoId = videoId || remove_start(base, 'dn') || base;
      formats.push({
        format_id: key,
        url: mediaUrl,
        vcodec: key === 'audio' ? 'none' : undefined,
      });
    }

    const defaultLang = 'en';
    const subtitles: Record<string, Subtitle[]> = {};
    const addSubtitleItem = (lang: string, info: Subtitle) => {
      (subtitles[lang] ||= []).push(info);
    };

    if (jsonData.caption_file) {
      addSubtitleItem(defaultLang, { url: new URL(String(jsonData.caption_file), url).href, ext: 'vtt' });
    }
    const captions = Array.isArray(jsonData.captions) ? jsonData.captions : [];
    for (const item of captions) {
      if (!item || typeof item !== 'object') continue;
      const sub = item as Record<string, unknown>;
      const lang = String(sub.language ?? '').toLowerCase() || defaultLang;
      addSubtitleItem(lang, { url: new URL(String(sub.url), url).href, ext: 'vtt' });
    }

    return {
      id: videoId || displayId,
      title,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: (jsonData.image as string) ?? undefined,
      subtitles,
      formats,
    };
  }
}

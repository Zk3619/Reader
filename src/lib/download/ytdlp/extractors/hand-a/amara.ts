/**
 * AmaraIE — aligned with yt-dlp amara.py
 */

import { InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { int_or_none, update_url_query } from '../../utils';
import { VimeoIE } from '../sites';
import { YoutubeIE } from '../youtube';

function parseIso8601(dateStr: unknown): number | null {
  if (dateStr == null) return null;
  const t = Date.parse(String(dateStr));
  return Number.isFinite(t) ? Math.trunc(t / 1000) : null;
}

export class AmaraIE extends InfoExtractor {
  static IE_NAME = 'amara';
  static _VALID_URL = /https?:\/\/(?:www\.)?amara\.org\/(?:\w+\/)?videos\/(?<id>\w+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const meta = await this._download_json<Record<string, unknown>>(
      `https://amara.org/api/videos/${videoId}/`,
      videoId,
      undefined,
      { query: { format: 'json' } },
    );

    const title = String(meta.title || videoId);
    const allUrls = (meta.all_urls as string[]) || [];
    const videoUrl = allUrls[0];
    if (!videoUrl) {
      throw new Error('Unable to extract Amara video URL');
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const language of (meta.languages as Record<string, unknown>[]) || []) {
      const subtitlesUri = language.subtitles_uri as string | undefined;
      if (!subtitlesUri || !language.published) continue;
      const code = String(language.code || 'en');
      const subtitle = subtitles[code] || (subtitles[code] = []);
      for (const ext of ['json', 'srt', 'vtt'] as const) {
        subtitle.push({
          ext,
          url: update_url_query(subtitlesUri, { format: ext }),
        });
      }
    }

    const info: VideoInfo = {
      url: videoUrl,
      id: videoId,
      subtitles,
      title,
      description: (meta.description as string | undefined) ?? null,
      thumbnail: (meta.thumbnail as string | undefined) ?? undefined,
      duration: int_or_none(meta.duration),
      timestamp: parseIso8601(meta.created),
      webpage_url: url,
      original_url: url,
      extractor: 'amara',
      extractor_key: 'Amara',
    };

    if (YoutubeIE.suitable(videoUrl)) {
      info._type = 'url_transparent';
      info.ie_key = 'Youtube';
    } else if (VimeoIE.suitable(videoUrl)) {
      info._type = 'url_transparent';
      info.ie_key = 'Vimeo';
    }

    return info;
  }
}

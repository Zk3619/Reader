/**
 * JixieBaseIE — ported from yt-dlp jixie.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, float_or_none, int_or_none, str_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class JixieBaseIE extends InfoExtractor {
  static IE_NAME = 'jixiebase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('JixieBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractDataFromJixieId(
    displayId: string,
    videoId: string,
    webpage?: string,
  ): Promise<VideoInfo> {
    const jsonData = (
      await this._download_json<{ data?: Record<string, unknown> }>(
        'https://apidam.jixie.io/api/public/stream',
        displayId,
        undefined,
        { query: { metadata: 'full', video_id: videoId } },
      )
    ).data as Record<string, unknown>;

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const hasDrm = Boolean(jsonData.drm);

    for (const stream of (jsonData.streams as Array<Record<string, unknown>>) || []) {
      if (stream.type === 'HLS') {
        const streamUrl = str_or_none(stream.url);
        if (!streamUrl) continue;
        const { formats: hlsFormats, subtitles: hlsSubs } = await extractM3u8FormatsAndSubtitles(
          this,
          streamUrl,
          displayId,
          'hls',
        );
        if (hasDrm) {
          for (const f of hlsFormats) f.has_drm = true;
        }
        formats.push(...hlsFormats);
        mergeSubtitles(subtitles, hlsSubs);
      } else {
        const streamUrl = str_or_none(stream.url);
        if (!streamUrl) continue;
        formats.push({
          url: streamUrl,
          format_id: 'http',
          width: int_or_none(stream.width) ?? undefined,
          height: int_or_none(stream.height) ?? undefined,
          ext: 'mp4',
        });
      }
    }

    const metadata = (jsonData.metadata as Record<string, unknown>) || {};
    const keywords = str_or_none(metadata.keywords);
    const categories = str_or_none(metadata.categories);

    return {
      id: videoId,
      display_id: displayId,
      formats,
      subtitles,
      title:
        str_or_none(jsonData.title) ||
        (webpage ? this._html_search_meta(['og:title', 'twitter:title'], webpage) : undefined) ||
        displayId,
      description:
        clean_html(str_or_none(metadata.description)) ||
        (webpage
          ? this._html_search_meta(['description', 'og:description', 'twitter:description'], webpage)
          : undefined) ||
        undefined,
      thumbnails: ((metadata.thumbnails as Array<{ url: string }>) || []).map((t) => ({
        url: t.url,
      })),
      duration: float_or_none(metadata.duration) ?? undefined,
      tags: keywords ? keywords.split(',') : undefined,
      categories: categories ? categories.split(',') : undefined,
      uploader_id: str_or_none(jsonData.owner_id) ?? undefined,
    };
  }
}

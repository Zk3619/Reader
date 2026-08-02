/**
 * KompasVideoIE — ported from yt-dlp kompas.py (JixieBaseIE inlined)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, float_or_none, int_or_none, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

class JixieBaseIE extends InfoExtractor {
  static IE_NAME = 'jixiebase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('JixieBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractDataFromJixieId(
    displayId: string,
    videoId: string,
    webpage: string,
  ): Promise<VideoInfo> {
    const jsonData = (
      await this._download_json<{ data?: Record<string, unknown> }>(
        'https://apidam.jixie.io/api/public/stream',
        displayId,
        undefined,
        { query: { metadata: 'full', video_id: videoId } },
      )
    ).data!;

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    for (const stream of (jsonData.streams as Array<Record<string, unknown>>) || []) {
      if (stream.type === 'HLS') {
        const res = await extractM3u8FormatsAndSubtitles(this, String(stream.url ?? ''), displayId, 'hls');
        if (jsonData.drm) {
          for (const f of res.formats) f.has_drm = true;
        }
        formats.push(...res.formats);
        subtitles = mergeSubtitles(subtitles, res.subtitles);
      } else {
        formats.push({
          url: String(stream.url ?? ''),
          width: int_or_none(stream.width) ?? undefined,
          height: int_or_none(stream.height) ?? undefined,
          ext: 'mp4',
          format_id: 'http',
        });
      }
    }

    const keywords = traverse_obj(jsonData, ['metadata', 'keywords']) as string | undefined;
    const categories = traverse_obj(jsonData, ['metadata', 'categories']) as string | undefined;

    return {
      id: videoId,
      display_id: displayId,
      formats,
      subtitles,
      title:
        (jsonData.title as string | undefined) ||
        this._html_search_meta(['og:title', 'twitter:title'], webpage, undefined, false) ||
        undefined,
      description:
        clean_html(String(traverse_obj(jsonData, ['metadata', 'description']) ?? '')) ||
        this._html_search_meta(['description', 'og:description', 'twitter:description'], webpage, undefined, false) ||
        undefined,
      thumbnails: (traverse_obj(jsonData, ['metadata', 'thumbnails']) as Array<{ url?: string }> | undefined)
        ?.map((t) => (t.url ? { url: t.url } : null))
        .filter(Boolean) as Array<{ url: string }> | undefined,
      duration: float_or_none(traverse_obj(jsonData, ['metadata', 'duration'])) ?? undefined,
      tags: keywords ? keywords.split(',') : undefined,
      categories: categories ? categories.split(',') : undefined,
      uploader_id: (jsonData.owner_id as string | undefined) ?? undefined,
    };
  }
}

export class KompasVideoIE extends JixieBaseIE {
  static IE_NAME = 'kompas';
  static _VALID_URL =
    /https?:\/\/video\.kompas\.com\/\w+\/(?<id>\d+)\/(?<slug>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.slug!;
    const webpage = await this._download_webpage(url, displayId);
    return this._extractDataFromJixieId(displayId, videoId, webpage);
  }
}

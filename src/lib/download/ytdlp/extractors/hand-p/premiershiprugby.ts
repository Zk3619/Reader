/** PremiershipRugbyIE — ported from yt-dlp premiershiprugby.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, traverse_obj } from '../../utils';

export class PremiershipRugbyIE extends InfoExtractor {
  static IE_NAME = 'premiershiprugby';
  static _VALID_URL = /https?:\/\/(?:\w+\.)?premiershiprugby\.com\/watch\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const jsonData = (
      await this._download_json<{ data?: { article?: Record<string, unknown> } }>(
        `https://article-cms-api.incrowdsports.com/v2/articles/slug/${displayId}`,
        displayId,
        undefined,
        { query: { clientId: 'PRL' } },
      )
    ).data?.article || {};
    const heroMedia = (jsonData.heroMedia as Record<string, unknown>) || {};
    const content = (heroMedia.content as Record<string, unknown>) || {};
    const metadata = (content.metadata as Record<string, unknown>) || {};

    const formats = await this._extract_m3u8_formats(
      String(content.videoLink ?? ''),
      displayId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );
    const subtitles = undefined;

    return {
      id: String(content.sourceSystemId ?? displayId),
      display_id: displayId,
      title: traverse_obj(heroMedia, 'title') as string | undefined,
      formats,
      subtitles,
      thumbnail: traverse_obj(heroMedia, ['content', 'videoThumbnail']) as string | undefined,
      duration: int_or_none(metadata.msDuration, 1000) ?? undefined,
      tags: jsonData.tags as string[] | undefined,
      categories: traverse_obj(jsonData, ['categories', 'text']) as string[] | undefined,
    };
  }
}

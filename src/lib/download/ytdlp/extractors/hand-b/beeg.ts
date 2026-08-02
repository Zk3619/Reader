/**
 * BeegIE — aligned with yt-dlp beeg.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, unified_timestamp } from '../../utils';
import { rtaSearch } from './_helpers';

export class BeegIE extends InfoExtractor {
  static IE_NAME = 'beeg';
  static _VALID_URL = /https?:\/\/(?:www\.)?beeg\.(?:com(?:\/video)?)\/-?(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const video = await this._download_json<Record<string, unknown>>(
      `https://store.externulls.com/facts/file/${videoId}`,
      videoId,
      `Downloading JSON for ${videoId}`,
    );

    const fcFacts = (video.fc_facts as Record<string, unknown>[]) || [];
    let firstFact: Record<string, unknown> = {};
    for (const fact of fcFacts) {
      if (!Object.keys(firstFact).length || Number(fact.id) < Number(firstFact.id)) firstFact = fact;
    }

    const resources =
      (traverse_obj(video, ['file', 'hls_resources']) as Record<string, string> | undefined) ||
      (firstFact.hls_resources as Record<string, string> | undefined) ||
      {};

    const formats: Format[] = [];
    for (const [formatId, videoUri] of Object.entries(resources)) {
      if (!videoUri) continue;
      const heightMatch = /fl_cdn_(\d+)/.exec(formatId);
      const height = int_or_none(heightMatch?.[1]);
      const currentFormats = await this._extract_m3u8_formats(
        `https://video.beeg.com/${videoUri}`,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        height != null ? String(height) : undefined,
      );
      for (const f of currentFormats) f.height = height;
      formats.push(...currentFormats);
    }

    return {
      id: videoId,
      display_id: str_or_none(firstFact.id) || undefined,
      title: str_or_none(traverse_obj(video, ['file', 'stuff', 'sf_name'])) || videoId,
      description: str_or_none(traverse_obj(video, ['file', 'stuff', 'sf_story'])) || null,
      timestamp: unified_timestamp(firstFact.fc_created) ?? undefined,
      duration: int_or_none(traverse_obj(video, ['file', 'fl_duration'])) ?? undefined,
      tags: (traverse_obj(video, ['tags'], { get_all: true }) as Record<string, unknown>[] | undefined)
        ?.map((t) => str_or_none(t?.tg_name))
        .filter((t): t is string => !!t),
      formats,
      age_limit: rtaSearch(webpage) ?? undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'beeg',
      extractor_key: 'Beeg',
    };
  }
}

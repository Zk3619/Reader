/**
 * TF1IE — ported from yt-dlp tf1.py
 */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { parseIso8601 } from '../hand-a/helpers';

export class TF1IE extends InfoExtractor {
  static IE_NAME = 'tf1';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?tf1\.fr\/[^/]+\/(?<program_slug>[^/]+)\/videos\/(?<id>[^/?&#]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const programSlug = m.groups!.program_slug!;
    const slug = m.groups!.id!;

    const video = (
      await this._download_json<{ data?: { videoBySlug?: Record<string, unknown> } }>(
        'https://www.tf1.fr/graphql/web',
        slug,
        undefined,
        {
          query: {
            id: '9b80783950b85247541dd1d851f9cc7fa36574af015621f853ab111a679ce26f',
            variables: JSON.stringify({ programSlug, slug }),
          },
        },
      )
    ).data?.videoBySlug;
    if (!video) throw new Error('videoBySlug missing');

    const watId = String(video.streamId);
    const tags: string[] = [];
    for (const tag of (video.tags as Array<Record<string, unknown>>) || []) {
      const label = tag.label as string | undefined;
      if (label) tags.push(label);
    }

    const decoration = (video.decoration || {}) as Record<string, unknown>;
    const thumbnails: Thumbnail[] = [];
    const image = decoration.image as Record<string, unknown> | undefined;
    for (const source of (image?.sources as Array<Record<string, unknown>>) || []) {
      const sourceUrl = source.url as string | undefined;
      if (!sourceUrl) continue;
      thumbnails.push({ url: sourceUrl, width: int_or_none(source.width) ?? undefined });
    }

    const publicPlaying = video.publicPlayingInfos as Record<string, unknown> | undefined;

    return {
      _type: 'url_transparent',
      id: watId,
      url: `wat:${watId}`,
      title: (video.title as string) || watId,
      thumbnails,
      description: (decoration.description as string) || undefined,
      timestamp: parseIso8601(video.date as string) ?? undefined,
      duration: int_or_none(publicPlaying?.duration) ?? undefined,
      tags,
      series: (decoration.programLabel as string) || undefined,
      season_number: int_or_none(video.season) ?? undefined,
      episode_number: int_or_none(video.episode) ?? undefined,
      extractor: 'Wat',
      extractor_key: 'Wat',
    };
  }
}

/**
 * Art19IE — aligned with yt-dlp art19.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601 } from './helpers';

const UUID_REGEX = '[\\da-f]{8}-?[\\da-f]{4}-?[\\da-f]{4}-?[\\da-f]{4}-?[\\da-f]{12}';

export class Art19IE extends InfoExtractor {
  static IE_NAME = 'art19';
  static _VALID_URL = [
    new RegExp(`https?:\\/\\/(?:www\\.)?art19\\.com\\/shows\\/[^/#?]+\\/episodes\\/(?<id>${UUID_REGEX})`, 'i'),
    new RegExp(`https?:\\/\\/rss\\.art19\\.com\\/episodes\\/(?<id>${UUID_REGEX})\\.mp3`, 'i'),
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const episodeId = this._match_id(url);

    const playerMetadata = await this._download_json<Record<string, unknown>>(
      `https://art19.com/episodes/${episodeId}`,
      episodeId,
      'Downloading player metadata',
      { fatal: false, headers: { Accept: 'application/vnd.art19.v0+json' } },
    );
    const rssMetadata = await this._download_json<Record<string, unknown>>(
      `https://rss.art19.com/episodes/${episodeId}.json`,
      episodeId,
      'Downloading RSS metadata',
      { fatal: false },
    );

    const formats: Format[] = [
      {
        format_id: 'direct',
        url: `https://rss.art19.com/episodes/${episodeId}.mp3`,
        vcodec: 'none',
        acodec: 'mp3',
      },
    ];
    const media = traverse_obj(rssMetadata, ['content', 'media']) as Record<string, unknown> | undefined;
    if (media) {
      for (const [fmtId, fmtData] of Object.entries(media)) {
        if (fmtId === 'waveform_bin') continue;
        const fmtUrl = url_or_none((fmtData as Record<string, unknown>).url);
        if (!fmtUrl) continue;
        formats.push({
          format_id: fmtId,
          url: fmtUrl,
          vcodec: 'none',
          acodec: fmtId,
          quality: fmtId === 'ogg' ? -2 : -1,
        });
      }
    }

    const episode = traverse_obj(playerMetadata, ['episode']) as Record<string, unknown> | undefined;
    const content = traverse_obj(rssMetadata, ['content']) as Record<string, unknown> | undefined;

    return {
      id: episodeId,
      formats,
      title: String(content?.episode_title || episode?.title || episodeId),
      description: String(content?.episode_description_plain || episode?.description_plain || '') || null,
      episode_id: String(content?.episode_id || episode?.id || episodeId),
      episode_number: int_or_none(content?.episode_number ?? episode?.episode_number) ?? undefined,
      season: content?.season_title != null ? String(content.season_title) : undefined,
      season_id: content?.season_id != null ? String(content.season_id) : undefined,
      season_number: int_or_none(content?.season_number) ?? undefined,
      series: content?.series_title != null ? String(content.series_title) : undefined,
      series_id: String(content?.series_id || episode?.series_id || '') || undefined,
      thumbnail: url_or_none(content?.cover_image) || undefined,
      duration: float_or_none(content?.duration) ?? undefined,
      timestamp: parseIso8601(episode?.created_at) ?? undefined,
      release_timestamp: parseIso8601(episode?.released_at) ?? undefined,
      modified_timestamp: parseIso8601(episode?.updated_at) ?? undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'art19',
      extractor_key: 'Art19',
    };
  }
}

export class Art19ShowIE extends InfoExtractor {
  static IE_NAME = 'art19show';
  static _VALID_URL = [
    new RegExp(
      'https?:\\/\\/(?:www\\.)?art19\\.com\\/shows\\/(?<id>[\\w-]+)(?:\\/embed)?\\/?(?:$|[#?])',
      'i',
    ),
    new RegExp('https?:\\/\\/rss\\.art19\\.com\\/(?<id>[\\w-]+)\\/?(?:$|[#?])', 'i'),
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const seriesId = this._match_id(url);
    const seriesMetadata = await this._download_json<Record<string, unknown>>(
      `https://art19.com/series/${seriesId}`,
      seriesId,
      'Downloading series metadata',
      { headers: { Accept: 'application/vnd.art19.v0+json' } },
    );
    const series = traverse_obj(seriesMetadata, ['series']) as Record<string, unknown> | undefined;
    const episodeIds = (traverse_obj(seriesMetadata, ['series', 'episode_ids'], {
      get_all: true,
    }) ?? []) as unknown[];

    const entries = episodeIds
      .filter((id): id is string => typeof id === 'string')
      .map((episodeId) =>
        this.url_result(`https://rss.art19.com/episodes/${episodeId}.mp3`, 'Art19', episodeId),
      );

    const tags = (traverse_obj(seriesMetadata, ['tags', 'name'], { get_all: true }) ?? []) as string[];
    const playlist = this.playlist_result(
      entries,
      str_or_none(series?.id) || seriesId,
      str_or_none(series?.title) || seriesId,
      str_or_none(series?.description_plain) || null,
    );

    return {
      ...playlist,
      display_id: str_or_none(series?.slug) || undefined,
      timestamp: parseIso8601(series?.created_at) ?? undefined,
      modified_timestamp: parseIso8601(series?.updated_at) ?? undefined,
      tags: tags.length ? tags : undefined,
    };
  }
}

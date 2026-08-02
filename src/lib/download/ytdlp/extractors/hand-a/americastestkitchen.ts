/**
 * AmericasTestKitchenIE / AmericasTestKitchenSeasonIE
 * — aligned with yt-dlp americastestkitchen.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, try_get, unified_strdate, unified_timestamp } from '../../utils';

const ZYPE_API_KEY =
  'jZ9GUhRmxcPvX7M3SlfejB6Hle9jyHTdk2jVxG7wOHPLODgncEKVdPYBhuz9iWXQ';

const SHOWS: Record<string, [string, string]> = {
  americastestkitchen: ['', "America's Test Kitchen"],
  cookscountry: ['/cookscountry', "Cook's Country"],
  cooksillustrated: ['/cooksillustrated', "Cook's Illustrated"],
};

function urlJoin(base: string, path: string): string {
  try {
    return new URL(path, base).href;
  } catch {
    return path;
  }
}

export class AmericasTestKitchenIE extends InfoExtractor {
  static IE_NAME = 'americastestkitchen';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:americastestkitchen|cooks(?:country|illustrated))\.com\/(?:cooks(?:country|illustrated)\/)?(?<resource_type>episode|videos)\/(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const match = this._match_valid_url(url);
    let resourceType = match?.groups?.resource_type || 'videos';
    const videoId = match?.groups?.id || this._match_id(url);
    const isEpisode = resourceType === 'episode';
    if (isEpisode) resourceType = 'episodes';

    const resource = await this._download_json<Record<string, unknown>>(
      `https://www.americastestkitchen.com/api/v6/${resourceType}/${videoId}`,
      videoId,
    );

    const video = (isEpisode ? resource.video : resource) as Record<string, unknown>;
    const episode = (isEpisode ? resource : resource.episode || {}) as Record<string, unknown>;
    const zypeId = String(video?.zypeId || '');

    return {
      _type: 'url_transparent',
      id: videoId,
      url: `https://player.zype.com/embed/${zypeId}.js?api_key=${ZYPE_API_KEY}`,
      ie_key: 'Zype',
      description: clean_html(video?.description as string | undefined),
      timestamp: unified_timestamp(video?.publishDate),
      release_date: unified_strdate(video?.publishDate),
      episode_number: int_or_none(episode?.number),
      season_number: int_or_none(episode?.season),
      series: try_get(episode, (x: Record<string, unknown>) =>
        (x.show as Record<string, unknown> | undefined)?.title,
      ) as string | undefined,
      episode: (episode?.title as string | undefined) ?? undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'americastestkitchen',
      extractor_key: 'AmericasTestKitchen',
    };
  }
}

export class AmericasTestKitchenSeasonIE extends InfoExtractor {
  static IE_NAME = 'americastestkitchenseason';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<domain>americastestkitchen|cookscountry|cooksillustrated)\.com(?:\/(?<path>cookscountry|cooksillustrated))?(?:\/episodes(?:\/browse)?\/season[-_](?<season>\d+))?\/?(?:[?#]|$)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const match = this._match_valid_url(url);
    const domain = match?.groups?.domain || 'americastestkitchen';
    const urlPath = match?.groups?.path || domain;
    const seasonNum = int_or_none(match?.groups?.season);
    const [showPath, title] = SHOWS[urlPath] || SHOWS[domain] || ['', domain];

    if (seasonNum) {
      const entries = await this.seasonEntries(showPath, seasonNum);
      return this.playlist_result(entries, `season_${seasonNum}`, `Season ${seasonNum}`);
    }

    const entries: VideoInfo[] = [];
    for (let seasonNumber = 1; ; seasonNumber++) {
      try {
        entries.push(...(await this.seasonEntries(showPath, seasonNumber)));
      } catch (e) {
        const cause = (e as ExtractorError & { cause?: { status?: number } }).cause;
        if (e instanceof ExtractorError && cause?.status === 404) break;
        throw e;
      }
    }

    return this.playlist_result(entries, urlPath, title);
  }

  private async seasonEntries(showPath: string, seasonNumber: number): Promise<VideoInfo[]> {
    const seasonUrl = `https://www.americastestkitchen.com${showPath}/episodes/season-${seasonNumber}`;
    const webpage = await this._download_webpage(
      seasonUrl,
      `season-${seasonNumber}`,
      `Downloading season ${seasonNumber} webpage`,
    );

    const entries: VideoInfo[] = [];
    const seen = new Set<string>();
    for (const m of webpage.matchAll(
      /<a [^>]*\bhref="(?<path>\/(?:cookscountry\/|cooksillustrated\/)?episode\/(?<id>\d+)-[^"]+)"[^>]*>\s*<h3[^>]*>(?<title>[^<]+)<\/h3>/g,
    )) {
      const path = m.groups?.path;
      if (!path || seen.has(path)) continue;
      seen.add(path);
      entries.push(
        this.url_result(
          urlJoin('https://www.americastestkitchen.com', path),
          'AmericasTestKitchen',
          m.groups?.id || undefined,
          clean_html(m.groups?.title || null) || undefined,
        ),
      );
      entries[entries.length - 1]!.season_number = seasonNumber;
    }

    if (!entries.length) {
      throw new ExtractorError(`No episodes found for season ${seasonNumber}`, {
        expected: true,
        cause: { status: 404 },
      });
    }

    return entries;
  }
}

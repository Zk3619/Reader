/**
 * IHeartRadioBaseIE / IHeartRadioIE / IHeartRadioPodcastIE — ported from yt-dlp iheart.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none } from '../../utils';

function cleanPodcastUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    return u.toString();
  } catch {
    return url;
  }
}

export class IHeartRadioBaseIE extends InfoExtractor {
  static IE_NAME = 'iheartradiobase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('IHeartRadioBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(path: string, videoId: string, fatal = true, query?: Record<string, string>) {
    return this._download_json<Record<string, unknown>>(
      `https://api.iheart.com/api/v3/podcast/${path}`,
      videoId,
      undefined,
      { fatal, query },
    );
  }

  protected _extractEpisode(episode: Record<string, unknown>): Partial<VideoInfo> {
    return {
      thumbnail: episode.imageUrl as string | undefined,
      description: clean_html(episode.description as string | undefined) ?? undefined,
      timestamp: int_or_none(episode.startDate, 1000) ?? undefined,
      duration: int_or_none(episode.duration) ?? undefined,
    };
  }
}

export class IHeartRadioIE extends IHeartRadioBaseIE {
  static IE_NAME = 'iheartradio';
  static _VALID_URL =
    /(?:https?:\/\/(?:www\.)?iheart\.com\/podcast\/[^/]+\/episode\/(?<display_id>[^/?&#]+)-|iheartradio:)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const episodeId = this._match_id(url);
    const response = await this._callApi(`episodes/${episodeId}`, episodeId);
    const episode = (response.episode as Record<string, unknown>) || {};
    return {
      ...this._extractEpisode(episode),
      id: episodeId,
      title: episode.title as string | undefined,
      url: cleanPodcastUrl(String(episode.mediaUrl ?? '')),
    };
  }
}

export class IHeartRadioPodcastIE extends IHeartRadioBaseIE {
  static IE_NAME = 'iheartradio:podcast';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?iheart(?:podcastnetwork)?\.com\/podcast\/[^/?&#]+-(?<id>\d+)\/?(?:[?#&]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const podcastId = this._match_id(url);
    const path = `podcasts/${podcastId}`;
    const episodesResponse = await this._callApi(`${path}/episodes`, podcastId, true, { limit: '1000000000' });
    const episodes = (episodesResponse.data as Record<string, unknown>[]) || [];

    const entries: VideoInfo[] = [];
    for (const episode of episodes) {
      const episodeId = str_or_none(episode.id);
      if (!episodeId) continue;
      entries.push({
        ...this._extractEpisode(episode),
        _type: 'url',
        id: episodeId,
        title: episode.title as string | undefined,
        url: `iheartradio:${episodeId}`,
        ie_key: 'IHeartRadio',
      });
    }

    const podcast = (await this._callApi(path, podcastId, false)) || {};
    return this.playlist_result(
      entries,
      podcastId,
      podcast.title as string | undefined,
      podcast.description as string | undefined,
    );
  }
}

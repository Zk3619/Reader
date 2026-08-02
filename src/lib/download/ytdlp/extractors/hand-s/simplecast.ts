/** Simplecast family ù?ported from yt-dlp simplecast.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, try_get } from '../../utils';
import { clean_podcast_url, parseIso8601, strip_or_none, urlencodePostdata } from './_helpers';

const UUID_RE = String.raw`[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}`;

export class SimplecastBaseIE extends InfoExtractor {
  static IE_NAME = 'simplecast:base';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _API_BASE = 'https://api.simplecast.com/';

  async _real_extract(_url: string): Promise<VideoInfo> {
    return this.url_result('', 'generic');
  }

  protected async _callApi(pathTmpl: string, videoId: string): Promise<Record<string, unknown>> {
    return this._download_json(`${SimplecastBaseIE._API_BASE}${pathTmpl.replace('%s', videoId)}`, videoId);
  }

  protected async _callSearchApi(resource: string, resourceId: string, resourceUrl: string): Promise<Record<string, unknown>> {
    return this._download_json(`${SimplecastBaseIE._API_BASE}${resource}s/search`, resourceId, undefined, {
      method: 'POST',
      data: urlencodePostdata({ url: resourceUrl }),
    });
  }

  protected _parseEpisode(episode: Record<string, unknown>): VideoInfo {
    const episodeId = String(episode.id);
    const audioFile = (episode.audio_file as Record<string, unknown>) || {};
    const audioFileUrl =
      (audioFile.url as string | undefined) ||
      (episode.audio_file_url as string | undefined) ||
      (episode.enclosure_url as string | undefined);
    const season = (episode.season as Record<string, unknown>) || {};
    const seasonHref = season.href as string | undefined;
    let seasonId: string | undefined;
    if (seasonHref) {
      seasonId =
        this._search_regex(new RegExp(`https?://api.simplecast.com/seasons/(${UUID_RE})`), seasonHref, 'season id', null, false) ||
        undefined;
    }
    const webpageUrl = episode.episode_url as string | undefined;
    let channelUrl: string | undefined;
    if (webpageUrl) {
      channelUrl =
        this._search_regex(/(https?:\/\/[^/]+\.simplecast\.com)/, webpageUrl, 'channel url', null, false) || undefined;
    }
    return {
      id: episodeId,
      display_id: episode.slug as string | undefined,
      title: String(episode.title || '').trim(),
      url: clean_podcast_url(audioFileUrl!),
      webpage_url: webpageUrl,
      channel_url: channelUrl,
      series: try_get(episode, (x) => (x.podcast as Record<string, unknown>)?.title as string),
      season_number: int_or_none(season.number) ?? undefined,
      season_id: seasonId,
      thumbnail: episode.image_url as string | undefined,
      episode_id: episodeId,
      episode_number: int_or_none(episode.number) ?? undefined,
      description: strip_or_none(episode.description) || undefined,
      timestamp: parseIso8601(episode.published_at) ?? undefined,
      duration: int_or_none(episode.duration) ?? undefined,
      filesize: int_or_none(audioFile.size || episode.audio_file_size) ?? undefined,
      ext: 'mp3',
      vcodec: 'none',
    };
  }
}

export class SimplecastIE extends SimplecastBaseIE {
  static IE_NAME = 'simplecast';
  static _VALID_URL = new RegExp(
    `https?:\\/\\/(?:api\\.simplecast\\.com\\/episodes|player\\.simplecast\\.com)\\/(?<id>${UUID_RE})`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const episodeId = this._match_id(url);
    const episode = await this._callApi('episodes/%s', episodeId);
    return this._parseEpisode(episode);
  }
}

export class SimplecastEpisodeIE extends SimplecastBaseIE {
  static IE_NAME = 'simplecast:episode';
  static _VALID_URL = /https?:\/\/(?!api\.)[^/]+\.simplecast\.com\/episodes\/(?<id>[^/?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const episode = await this._callSearchApi('episode', mobj.groups!.id!, mobj[0]);
    return this._parseEpisode(episode);
  }
}

export class SimplecastPodcastIE extends SimplecastBaseIE {
  static IE_NAME = 'simplecast:podcast';
  static _VALID_URL =
    /https?:\/\/(?!(?:api|cdn|embed|feeds|player)\.)(?<id>[^/]+)\.simplecast\.com(?!\/episodes\/[^/?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const subdomain = this._match_id(url);
    const site = await this._callSearchApi('site', subdomain, url);
    const podcast = (site.podcast as Record<string, unknown>) || {};
    const podcastId = String(podcast.id);
    const podcastTitle = podcast.title as string | undefined;
    const episodes = await this._download_json<Record<string, unknown>>(
      `${SimplecastBaseIE._API_BASE}podcasts/${podcastId}/episodes`,
      podcastId,
    );
    const entries = ((episodes.collection as Array<Record<string, unknown>>) || []).map((episode) => ({
      ...this._parseEpisode(episode),
      series: podcastTitle,
    }));
    return this.playlist_result(entries, podcastId, podcastTitle);
  }
}

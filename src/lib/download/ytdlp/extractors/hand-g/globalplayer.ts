/**
 * GlobalPlayer family — ported from yt-dlp globalplayer.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  join_nonempty,
  parse_duration,
  str_or_none,
  traverse_obj,
  unified_strdate,
  unified_timestamp,
} from '../../utils';
import { searchNextjsData } from './_helpers';

export class GlobalPlayerBaseIE extends InfoExtractor {
  static IE_NAME = 'globalplayerbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('GlobalPlayerBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _getPageProps(url: string, videoId: string) {
    const webpage = await this._download_webpage(url, videoId);
    return searchNextjsData(this, webpage, videoId).pageProps as Record<string, unknown>;
  }

  protected async _requestExt(streamUrl: string, videoId: string): Promise<string> {
    const res = await this._request_webpage(streamUrl, videoId, 'Determining source extension');
    const ct = res?.headers?.['content-type'] || '';
    if (/audio\/aac/i.test(ct)) return 'aac';
    if (/audio\/mp4/i.test(ct)) return 'm4a';
    if (/audio\/mpeg/i.test(ct)) return 'mp3';
    if (/video\/mp4/i.test(ct)) return 'mp4';
    return 'mp4';
  }

  protected _extractAudio(episode: Record<string, unknown>, series: Record<string, unknown>): VideoInfo {
    return {
      vcodec: 'none',
      series: series.title as string | undefined,
      series_id: series.id != null ? String(series.id) : undefined,
      thumbnail: (series.imageUrl as string | undefined) || (episode.imageUrl as string | undefined),
      uploader: series.itunesAuthor as string | undefined,
      id: String(episode.id ?? ''),
      description: clean_html(String(episode.description ?? '')) || undefined,
      duration: parse_duration(episode.duration as string | undefined) ?? undefined,
      url: episode.streamUrl as string | undefined,
      timestamp:
        unified_timestamp(episode.pubDate as string | undefined) ??
        unified_timestamp(episode.startDate as string | undefined) ??
        undefined,
      title: episode.title as string | undefined,
    };
  }
}

export class GlobalPlayerLiveIE extends GlobalPlayerBaseIE {
  static IE_NAME = 'globalplayerlive';
  static _VALID_URL = /https?:\/\/www\.globalplayer\.com\/live\/(?<id>\w+)\/\w+/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const station = (await this._getPageProps(url, videoId)).station as Record<string, unknown>;
    const streamUrl = String(station.streamUrl ?? '');
    return {
      id: String(station.id ?? videoId),
      display_id: join_nonempty(String(station.brandSlug ?? ''), String(station.slug ?? '')) || (station.legacyStationPrefix as string | undefined),
      url: streamUrl,
      ext: await this._requestExt(streamUrl, videoId),
      vcodec: 'none',
      is_live: true,
      title: str_or_none(station.name) || str_or_none(station.brandName) || undefined,
      description: station.tagline as string | undefined,
      thumbnail: station.brandLogo as string | undefined,
    };
  }
}

export class GlobalPlayerLivePlaylistIE extends GlobalPlayerBaseIE {
  static IE_NAME = 'globalplayerliveplaylist';
  static _VALID_URL = /https?:\/\/www\.globalplayer\.com\/playlists\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const station = (await this._getPageProps(url, videoId)).playlistData as Record<string, unknown>;
    const streamUrl = String(station.streamUrl ?? '');
    return {
      id: videoId,
      url: streamUrl,
      ext: await this._requestExt(streamUrl, videoId),
      vcodec: 'none',
      is_live: true,
      title: station.title as string | undefined,
      description: station.description as string | undefined,
      thumbnail: station.image as string | undefined,
    };
  }
}

export class GlobalPlayerAudioIE extends GlobalPlayerBaseIE {
  static IE_NAME = 'globalplayeraudio';
  static _VALID_URL =
    /https?:\/\/www\.globalplayer\.com\/(?:(?<podcast>podcasts)\/|catchup\/\w+\/\w+\/)(?<id>\w+)\/?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const podcast = m.groups!.podcast;
    const props = await this._getPageProps(url, videoId);
    const series = (podcast ? props.podcastInfo : props.catchupInfo) as Record<string, unknown>;
    const episodes = ((series.episodes as Array<Record<string, unknown>>) || []).filter(
      (ep) => ep.id && ep.streamUrl,
    );

    return {
      _type: 'playlist',
      id: videoId,
      entries: episodes.map((ep) => this._extractAudio(ep, series)),
      categories: traverse_obj(series, ['categories', 'ALL', 'name']) as string[] | undefined,
      description: series.description as string | undefined,
      thumbnail: series.imageUrl as string | undefined,
      title: series.title as string | undefined,
      uploader: series.itunesAuthor as string | undefined,
    };
  }
}

export class GlobalPlayerAudioEpisodeIE extends GlobalPlayerBaseIE {
  static IE_NAME = 'globalplayeraudioepisode';
  static _VALID_URL =
    /https?:\/\/www\.globalplayer\.com\/(?:(?<podcast>podcasts)|catchup\/\w+\/\w+)\/episodes\/(?<id>\w+)\/?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const podcast = m.groups!.podcast;
    const props = await this._getPageProps(url, videoId);
    const episode = (podcast ? props.podcastEpisode : props.catchupEpisode) as Record<string, unknown>;
    const series =
      ((episode.podcast || episode.show) as Record<string, unknown> | undefined) || {};
    return this._extractAudio(episode, series);
  }
}

export class GlobalPlayerVideoIE extends GlobalPlayerBaseIE {
  static IE_NAME = 'globalplayervideo';
  static _VALID_URL = /https?:\/\/www\.globalplayer\.com\/videos\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const meta = (await this._getPageProps(url, videoId)).videoData as Record<string, unknown>;
    return {
      id: videoId,
      url: meta.url as string | undefined,
      thumbnail: traverse_obj(meta, ['image', 'url']) as string | undefined,
      title: meta.title as string | undefined,
      upload_date: unified_strdate(meta.publish_date as string | undefined) ?? undefined,
      description: meta.description as string | undefined,
    };
  }
}

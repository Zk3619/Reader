/**
 * BandlabIE family — ported from yt-dlp bandlab.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, int_or_none, parse_qs, str_or_none, truncate_string, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class BandlabBaseIE extends InfoExtractor {
  static IE_NAME = 'bandlabbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('BandlabBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(
    endpoint: string,
    assetId: string,
    opts?: { headers?: Record<string, string>; query?: Record<string, string>; fatal?: boolean; note?: string },
  ): Promise<Record<string, unknown>> {
    return this._download_json(
      `https://www.bandlab.com/api/v1.3/${endpoint}/${assetId}`,
      assetId,
      opts?.note,
      {
        headers: {
          accept: 'application/json',
          referer: 'https://www.bandlab.com/',
          'x-client-id': 'BandLab-Web',
          'x-client-version': '10.1.124',
          ...(opts?.headers || {}),
        },
        query: opts?.query,
        fatal: opts?.fatal,
      },
    );
  }

  protected _parseRevision(revisionData: Record<string, unknown>, url?: string): VideoInfo {
    const id = str_or_none(revisionData.revisionId) || str_or_none(revisionData.id) || '';
    const song = (revisionData.song as Record<string, unknown>) || {};
    const mixdown = (revisionData.mixdown as Record<string, unknown>) || {};
    const creator = (revisionData.creator as Record<string, unknown>) || {};
    const counters = (revisionData.counters as Record<string, unknown>) || {};
    return {
      vcodec: 'none',
      media_type: 'revision',
      extractor_key: 'Bandlab',
      extractor: 'bandlab',
      id,
      webpage_url: url || (id ? `https://www.bandlab.com/revision/${id}` : undefined),
      title: str_or_none(song.name) || undefined,
      track: str_or_none(song.name) || undefined,
      url: url_or_none(mixdown.file) || undefined,
      thumbnail: url_or_none((song.picture as Record<string, unknown>)?.url) || undefined,
      description: str_or_none(revisionData.description) || undefined,
      uploader: str_or_none(creator.name) || undefined,
      uploader_id: str_or_none(creator.username) || undefined,
      timestamp: parseIso8601(revisionData.createdOn) ?? undefined,
      duration: float_or_none(mixdown.duration) ?? undefined,
      view_count: int_or_none(counters.plays) ?? undefined,
      like_count: int_or_none(counters.likes) ?? undefined,
      comment_count: int_or_none(counters.comments) ?? undefined,
      genres: Array.isArray(revisionData.genres)
        ? (revisionData.genres as Array<Record<string, unknown>>).map((g) => str_or_none(g.name)).filter(Boolean)
        : undefined,
    } as VideoInfo;
  }

  protected _parseTrack(trackData: Record<string, unknown>, url?: string): VideoInfo {
    const id = str_or_none(trackData.revisionId) || str_or_none(trackData.id) || '';
    const track = (trackData.track as Record<string, unknown>) || {};
    const sample = (track.sample as Record<string, unknown>) || {};
    const picture = (track.picture as Record<string, unknown>) || {};
    const creator = (trackData.creator as Record<string, unknown>) || {};
    const counters = (trackData.counters as Record<string, unknown>) || {};
    return {
      vcodec: 'none',
      media_type: 'track',
      extractor_key: 'Bandlab',
      extractor: 'bandlab',
      id,
      webpage_url: url || (id ? `https://www.bandlab.com/post/${id}` : undefined),
      url: url_or_none(sample.audioUrl) || undefined,
      title: str_or_none(track.name) || undefined,
      track: str_or_none(track.name) || undefined,
      description: str_or_none(trackData.caption) || undefined,
      thumbnail:
        url_or_none((picture.original as Record<string, unknown>)?.url) || url_or_none(picture.url) || undefined,
      view_count: int_or_none(counters.plays) ?? undefined,
      like_count: int_or_none(counters.likes) ?? undefined,
      comment_count: int_or_none(counters.comments) ?? undefined,
      duration: float_or_none(sample.duration) ?? undefined,
      uploader: str_or_none(creator.name) || undefined,
      uploader_id: str_or_none(creator.username) || undefined,
      timestamp: parseIso8601(trackData.createdOn) ?? undefined,
    } as VideoInfo;
  }

  protected _parseVideo(videoData: Record<string, unknown>, url?: string): VideoInfo {
    const id = str_or_none(videoData.id) || '';
    const video = (videoData.video as Record<string, unknown>) || {};
    const picture = (video.picture as Record<string, unknown>) || {};
    const videoCounters = (video.counters as Record<string, unknown>) || {};
    const counters = (videoData.counters as Record<string, unknown>) || {};
    const creator = (videoData.creator as Record<string, unknown>) || {};
    const caption = str_or_none(videoData.caption) || '';
    return {
      media_type: 'video',
      extractor_key: 'Bandlab',
      extractor: 'bandlab',
      id,
      webpage_url: url || (id ? `https://www.bandlab.com/post/${id}` : undefined),
      url: url_or_none(video.url) || undefined,
      title: truncate_string(caption.replace(/\n/g, ' '), 72) || undefined,
      description: caption || undefined,
      thumbnail: url_or_none(picture.url) || undefined,
      view_count: int_or_none(videoCounters.plays) ?? undefined,
      like_count: int_or_none(videoCounters.likes) ?? undefined,
      comment_count: int_or_none(counters.comments) ?? undefined,
      duration: float_or_none(video.duration) ?? undefined,
      uploader: str_or_none(creator.name) || undefined,
      uploader_id: str_or_none(creator.username) || undefined,
    } as VideoInfo;
  }
}

export class BandlabIE extends BandlabBaseIE {
  static IE_NAME = 'bandlab';
  static _VALID_URL = [
    /https?:\/\/(?:www\.)?bandlab\.com\/(?<url_type>track|post|revision)\/(?<id>[\da-f_-]+)/,
    /https?:\/\/(?:www\.)?bandlab\.com\/(?<url_type>embed)\/\?(?:[^#]*&)?id=(?<id>[\da-f-]+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const displayId = m?.groups?.id || '';
    const urlType = m?.groups?.url_type || '';

    const qs = parse_qs(url);
    let revisionId: string | undefined = qs.revId?.[0] || qs.id?.[0];
    if (urlType === 'revision') revisionId = displayId;

    let revisionData: Record<string, unknown> | undefined;
    if (!revisionId) {
      const postData = await this._callApi('posts', displayId, {
        note: 'Downloading post data',
        query: qs.sharedKey?.[0] ? { sharedKey: qs.sharedKey[0]! } : undefined,
      });

      revisionId =
        str_or_none((postData as Record<string, unknown>).revisionId) ||
        str_or_none(((postData as Record<string, unknown>).revision as Record<string, unknown> | undefined)?.id) ||
        undefined;
      revisionData = ((postData as Record<string, unknown>).revision as Record<string, unknown> | undefined) || undefined;

      if (!revisionData && !revisionId) {
        const postType = (postData as Record<string, unknown>).type;
        if (postType === 'Video') return this._parseVideo(postData, url);
        if (postType === 'Track') return this._parseTrack(postData, url);
        throw new ExtractorError(`Could not extract data for post type ${postType}`);
      }
    }

    if (!revisionData) {
      revisionData = await this._callApi('revisions', revisionId!, {
        note: 'Downloading revision data',
        query: { edit: 'false' },
      });
    }

    return this._parseRevision(revisionData, url);
  }
}

export class BandlabPlaylistIE extends BandlabBaseIE {
  static IE_NAME = 'bandlab:playlist';
  static _VALID_URL = [
    /https?:\/\/(?:www\.)?bandlab\.com\/(?:[\w]+\/)?(?<type>albums|collections)\/(?<id>[\da-f-]+)/,
    /https?:\/\/(?:www\.)?bandlab\.com\/(?<type>embed)\/collection\/\?(?:[^#]*&)?id=(?<id>[\da-f-]+)/,
  ];

  protected *_entries(albumData: Record<string, unknown>): Generator<VideoInfo> {
    const posts = (albumData.posts as Array<Record<string, unknown>>) || [];
    for (const post of posts) {
      const postType = post.type;
      if (!postType) continue;
      if (postType === 'Revision') {
        yield this._parseRevision((post.revision as Record<string, unknown>) || {});
      } else if (postType === 'Track') {
        yield this._parseTrack(post);
      } else if (postType === 'Video') {
        yield this._parseVideo(post);
      } else {
        this.report_warning(`Skipping unknown post type: "${postType}"`);
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const playlistId = m?.groups?.id || '';
    let playlistType = m?.groups?.type || '';

    const endpointsByType: Record<string, string[]> = {
      albums: ['albums'],
      collections: ['collections'],
      embed: ['collections', 'albums'],
    };
    const endpoints = endpointsByType[playlistType] || [];

    let playlistData: Record<string, unknown> = {};
    for (const endpoint of endpoints) {
      playlistData = await this._callApi(endpoint, playlistId, {
        note: `Downloading ${endpoint.slice(0, -1)} data`,
        fatal: false,
      });
      if (!playlistData.errorCode) {
        playlistType = endpoint;
        break;
      }
    }
    if (playlistData.errorCode) {
      throw new ExtractorError(`Could not find playlist data. Error code: "${playlistData.errorCode}"`);
    }

    const creator = (playlistData.creator as Record<string, unknown>) || {};
    const counters = (playlistData.counters as Record<string, unknown>) || {};
    const picture = (playlistData.picture as Record<string, unknown>) || {};
    const releaseDate = str_or_none(playlistData.releaseDate);

    const result: VideoInfo = {
      ...this.playlist_result(
        [...this._entries(playlistData)],
        playlistId,
        str_or_none(playlistData.name) || undefined,
        str_or_none(playlistData.description) || undefined,
      ),
      uploader: str_or_none(creator.name) || undefined,
      uploader_id: str_or_none(creator.username) || undefined,
      timestamp: parseIso8601(playlistData.createdOn) ?? undefined,
      release_date: releaseDate ? releaseDate.replace(/-/g, '') : undefined,
      thumbnail:
        url_or_none((picture.original as Record<string, unknown>)?.url) || url_or_none(picture.url) || undefined,
      like_count: int_or_none(counters.likes) ?? undefined,
      comment_count: int_or_none(counters.comments) ?? undefined,
      view_count: int_or_none(counters.plays) ?? undefined,
    };
    if (playlistType === 'albums') {
      result.album = str_or_none(playlistData.name) || undefined;
      result.album_type = str_or_none(playlistData.type) || undefined;
    }
    return result;
  }
}

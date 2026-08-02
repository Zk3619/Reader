/** StoryFireBaseIE / StoryFireIE / StoryFireUserIE / StoryFireSeriesIE — ported from yt-dlp storyfire.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, smuggle_url } from '../../utils';

export class StoryFireBaseIE extends InfoExtractor {
  static IE_NAME = 'storyfirebase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _VALID_URL_BASE = 'https://(?:www\\.)?storyfire\\.com/';

  protected async _callApi(path: string, videoId: string, resource: string, query?: Record<string, unknown>) {
    const stringQuery = query
      ? Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)]))
      : undefined;
    return this._download_json<Record<string, unknown>>(
      `https://storyfire.com/app/${path}/${videoId}`,
      videoId,
      `Downloading ${resource} JSON metadata`,
      { query: stringQuery },
    );
  }

  protected _parseVideo(video: Record<string, unknown>): VideoInfo {
    const title = String(video.title || '');
    const vimeoUrl = String(video.vimeoVideoURL || '');
    const vimeoId = this._search_regex(/https?:\/\/player\.vimeo\.com\/external\/(\d+)/, vimeoUrl, 'vimeo id')!;
    const uploaderId = video.hostID as string | undefined;
    return {
      ...this.url_result(
        smuggle_url(`https://player.vimeo.com/video/${vimeoId}`, { referer: 'https://storyfire.com/' }),
        'Vimeo',
        vimeoId,
        title,
      ),
      description: (video.description as string) || undefined,
      thumbnail: (video.storyImage as string) || undefined,
      view_count: int_or_none(video.views) ?? undefined,
      like_count: int_or_none(video.likesCount) ?? undefined,
      comment_count: int_or_none(video.commentsCount) ?? undefined,
      duration: int_or_none(video.videoDuration) ?? undefined,
      timestamp: int_or_none(video.publishDate) ?? undefined,
      uploader: (video.username as string) || undefined,
      uploader_id: uploaderId,
      uploader_url: uploaderId ? `https://storyfire.com/user/${uploaderId}/video` : undefined,
      episode_number: int_or_none(video.episodeNumber ?? video.episode_number) ?? undefined,
    };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('StoryFireBaseIE is not a standalone extractor');
  }
}

export class StoryFireIE extends StoryFireBaseIE {
  static IE_NAME = 'storyfire';
  static _VALID_URL = /https?:\/\/(?:www\.)?storyfire\.com\/video-details\/(?<id>[0-9a-f]{24})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const resp = await this._callApi('generic/video-detail', videoId, 'video');
    return this._parseVideo((resp.video as Record<string, unknown>) || {});
  }
}

export class StoryFireUserIE extends StoryFireBaseIE {
  static IE_NAME = 'storyfire:user';
  static _VALID_URL = /https?:\/\/(?:www\.)?storyfire\.com\/user\/(?<id>[^/]+)\/video/;
  static _PAGE_SIZE = 20;

  protected async _fetchPage(userId: string, page: number): Promise<VideoInfo[]> {
    const resp = await this._callApi('publicVideos', userId, `page ${page + 1}`, { skip: page * StoryFireUserIE._PAGE_SIZE });
    const videos = (resp.videos as Record<string, unknown>[]) || [];
    return videos.map((v) => this._parseVideo(v));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const userId = this._match_id(url);
    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      const batch = await this._fetchPage(userId, page);
      if (!batch.length) break;
      entries.push(...batch);
      if (batch.length < StoryFireUserIE._PAGE_SIZE) break;
    }
    return this.playlist_result(entries, userId);
  }
}

export class StoryFireSeriesIE extends StoryFireBaseIE {
  static IE_NAME = 'storyfire:series';
  static _VALID_URL = /https?:\/\/(?:www\.)?storyfire\.com\/write\/series\/stories\/(?<id>[^/?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const seriesId = this._match_id(url);
    const stories = await this._callApi('seriesStories', seriesId, 'series stories');
    const entries: VideoInfo[] = [];
    for (const story of Object.values(stories)) {
      const s = story as Record<string, unknown>;
      if (s.hasVideo) entries.push(this._parseVideo(s));
    }
    return this.playlist_result(entries, seriesId);
  }
}

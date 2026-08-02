/**
 * MixchIE / MixchArchiveIE / MixchMovieIE — ported from yt-dlp mixch.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { UserNotLive } from './_helpers';

export class MixchIE extends InfoExtractor {
  static IE_NAME = 'mixch';
  static _VALID_URL = /https?:\/\/mixch\.tv\/u\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._download_json<Record<string, unknown>>(
      `https://mixch.tv/api-web/users/${videoId}/live`,
      videoId,
    );
    if (!traverse_obj(data, ['liveInfo'])) {
      throw new UserNotLive(videoId);
    }

    const liveInfo = (data.liveInfo as Record<string, unknown>) || {};
    const broadcaster = (data.broadcasterInfo as Record<string, unknown>) || {};

    return {
      id: videoId,
      uploader_id: videoId,
      title: str_or_none(liveInfo.title) ?? undefined,
      comment_count: int_or_none(liveInfo.comments) ?? undefined,
      view_count: int_or_none(liveInfo.visitor) ?? undefined,
      timestamp: int_or_none(liveInfo.created) ?? undefined,
      uploader: str_or_none(broadcaster.name) ?? undefined,
      formats: [
        {
          format_id: 'hls',
          url: String(liveInfo.hls ?? ''),
          ext: 'mp4',
          protocol: 'm3u8',
        },
      ],
      is_live: true,
    };
  }
}

export class MixchArchiveIE extends InfoExtractor {
  static IE_NAME = 'mixch:archive';
  static _VALID_URL = /https?:\/\/mixch\.tv\/archive\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    let infoJson: Record<string, unknown>;
    try {
      const resp = await this._download_json<{ archive: Record<string, unknown> }>(
        `https://mixch.tv/api-web/archive/${videoId}`,
        videoId,
      );
      infoJson = resp.archive || {};
    } catch (e) {
      const cause = (e as { cause?: { status?: number } }).cause;
      if (cause?.status === 401) this.raise_login_required();
      throw e;
    }

    return {
      id: videoId,
      title: str_or_none(infoJson.title) ?? undefined,
      formats: await this._extract_m3u8_formats(String(infoJson.archiveURL ?? ''), videoId),
      thumbnail: url_or_none(infoJson.thumbnailURL) ?? undefined,
    };
  }
}

export class MixchMovieIE extends InfoExtractor {
  static IE_NAME = 'mixch:movie';
  static _VALID_URL = /https?:\/\/mixch\.tv\/m\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._download_json<Record<string, unknown>>(
      `https://mixch.tv/api-web/movies/${videoId}`,
      videoId,
    );
    const movie = (data.movie as Record<string, unknown>) || {};
    const owner = (data.ownerInfo as Record<string, unknown>) || {};
    const ownerId = owner.id;

    const formats: Format[] = [
      {
        format_id: 'mp4',
        url: String(movie.file ?? ''),
        ext: 'mp4',
      },
    ];

    return {
      id: videoId,
      formats,
      title: str_or_none(movie.title) ?? undefined,
      thumbnail: url_or_none(movie.thumbnailURL) ?? undefined,
      uploader: str_or_none(owner.name) ?? undefined,
      uploader_id: ownerId != null ? String(ownerId) : undefined,
      channel_follower_count: int_or_none(owner.fan) ?? undefined,
      view_count: int_or_none(owner.view) ?? undefined,
      like_count: int_or_none(movie.favCount) ?? undefined,
      comment_count: int_or_none(movie.commentCount) ?? undefined,
      timestamp: int_or_none(movie.published) ?? undefined,
      uploader_url: ownerId ? `https://mixch.tv/u/${ownerId}` : undefined,
      live_status: 'not_live',
    };
  }
}

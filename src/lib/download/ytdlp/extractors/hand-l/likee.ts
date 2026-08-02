/**
 * LikeeIE / LikeeUserIE — ported from yt-dlp likee.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, js_to_json, str_or_none, traverse_obj } from '../../utils';
import { parse_iso8601 } from './_helpers';

export class LikeeIE extends InfoExtractor {
  static IE_NAME = 'likee';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?likee\.video\/(?:(?<channel_name>[^/]+)\/video\/|v\/)(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const info = this._parse_json<Record<string, unknown>>(
      this._search_regex(/window\.data\s*=\s*({.+?});/, webpage, 'video info')!,
      videoId,
      js_to_json,
    )!;
    const videoUrl = str_or_none(traverse_obj(info, ['video_url', ['originVideoInfo', 'video_url']]));
    if (!videoUrl) {
      this.raise_no_formats('Video was deleted', true);
    }

    const formats = [
      {
        format_id: 'mp4-with-watermark',
        url: videoUrl,
        height: int_or_none(info.video_height) ?? undefined,
        width: int_or_none(info.video_width) ?? undefined,
      },
      {
        format_id: 'mp4-without-watermark',
        url: videoUrl.replace('_4', ''),
        height: int_or_none(info.video_height) ?? undefined,
        width: int_or_none(info.video_width) ?? undefined,
        quality: 1,
      },
    ];

    return {
      id: videoId,
      title: str_or_none(info.msgText) ?? undefined,
      description: str_or_none(info.share_desc) ?? undefined,
      view_count: int_or_none(info.video_count) ?? undefined,
      like_count: int_or_none(info.likeCount) ?? undefined,
      comment_count: int_or_none(info.comment_count) ?? undefined,
      uploader: str_or_none(info.nick_name) ?? undefined,
      uploader_id: str_or_none(info.likeeId) ?? undefined,
      artist: str_or_none(traverse_obj(info, ['sound', 'owner_name'])) ?? undefined,
      timestamp: parse_iso8601(info.uploadDate) ?? undefined,
      thumbnail: info.coverUrl ? String(info.coverUrl) : undefined,
      duration: int_or_none(traverse_obj(info, ['option_data', 'dur'])) ?? undefined,
      formats,
    };
  }
}

export class LikeeUserIE extends InfoExtractor {
  static IE_NAME = 'likee:user';
  static _VALID_URL = /https?:\/\/(?:www\.)?likee\.video\/(?<id>[^/]+)\/?$/;
  static _PAGE_SIZE = 50;
  static _API_GET_USER_VIDEO = 'https://api.like-video.com/likee-activity-flow-micro/videoApi/getUserVideo';

  protected async *_entries(userName: string, userId: string): AsyncGenerator<VideoInfo> {
    let lastPostId = '';
    while (true) {
      const userVideos = await this._download_json<Record<string, unknown>>(
        LikeeUserIE._API_GET_USER_VIDEO,
        userName,
        `Get user info with lastPostId #${lastPostId}`,
        {
          method: 'POST',
          data: JSON.stringify({ uid: userId, count: LikeeUserIE._PAGE_SIZE, lastPostId, tabType: 0 }),
          headers: { 'content-type': 'application/json' },
        },
      );
      const items = traverse_obj(userVideos, ['data', 'videoList']) as Array<Record<string, unknown>> | undefined;
      if (!items?.length) break;
      for (const item of items) {
        lastPostId = String(item.postId ?? '');
        yield this.url_result(`https://likee.video/${userName}/video/${lastPostId}`);
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const userName = this._match_id(url);
    const webpage = await this._download_webpage(url, userName);
    const info = this._parse_json<Record<string, unknown>>(
      this._search_regex(/window\.data\s*=\s*({.+?});/, webpage, 'user info')!,
      userName,
      js_to_json,
    )!;
    const userId = String(traverse_obj(info, ['userinfo', 'uid']) ?? userName);
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(userName, userId)) entries.push(e);
    return this.playlist_result(
      entries,
      userId,
      str_or_none(traverse_obj(info, ['userinfo', 'user_name'])) ?? userName,
    );
  }
}

/**
 * DLiveVODIE / DLiveStreamIE — ported from yt-dlp dlive.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

const GRAPHQL_URL = 'https://graphigo.prd.dlive.tv/';

export class DLiveVODIE extends InfoExtractor {
  static IE_NAME = 'dlive:vod';
  static _VALID_URL = /https?:\/\/(?:www\.)?dlive\.tv\/p\/(?<uploader_id>.+?)\+(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const uploaderId = m.groups!.uploader_id!;
    const vodId = m.groups!.id!;
    const query = `query {
  pastBroadcast(permlink:"${uploaderId}+${vodId}") {
    content
    createdAt
    length
    playbackUrl
    title
    thumbnailUrl
    viewCount
  }
}`;
    const data = await this._download_json<{ data: { pastBroadcast: Record<string, unknown> } }>(
      GRAPHQL_URL,
      vodId,
      undefined,
      { data: JSON.stringify({ query }), method: 'POST', headers: { 'Content-Type': 'application/json' } },
    );
    const broadcast = data.data.pastBroadcast;
    const formats = await this._extract_m3u8_formats(
      String(broadcast.playbackUrl ?? ''),
      vodId,
      'mp4',
      'm3u8_native',
    );
    return {
      id: vodId,
      title: String(broadcast.title ?? vodId),
      uploader_id: uploaderId,
      formats,
      description: (broadcast.content as string) ?? undefined,
      thumbnail: (broadcast.thumbnailUrl as string) ?? undefined,
      timestamp: int_or_none(broadcast.createdAt, 1000) ?? undefined,
      view_count: int_or_none(broadcast.viewCount) ?? undefined,
    };
  }
}

export class DLiveStreamIE extends InfoExtractor {
  static IE_NAME = 'dlive:stream';
  static _VALID_URL = /https?:\/\/(?:www\.)?dlive\.tv\/(?!p\/)(?<id>[\w.-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayName = this._match_id(url);
    const query = `query {
  userByDisplayName(displayname:"${displayName}") {
    livestream {
      content
      createdAt
      title
      thumbnailUrl
      watchingCount
    }
    username
  }
}`;
    const data = await this._download_json<{ data: { userByDisplayName: Record<string, unknown> } }>(
      GRAPHQL_URL,
      displayName,
      undefined,
      { data: JSON.stringify({ query }), method: 'POST', headers: { 'Content-Type': 'application/json' } },
    );
    const user = data.data.userByDisplayName;
    const livestream = (user.livestream as Record<string, unknown>) || {};
    const username = String(user.username ?? displayName);
    const formats = await this._extract_m3u8_formats(
      `https://live.prd.dlive.tv/hls/live/${username}.m3u8`,
      displayName,
      'mp4',
    );
    return {
      id: displayName,
      title: String(livestream.title ?? displayName),
      uploader: displayName,
      uploader_id: username,
      formats,
      description: (livestream.content as string) ?? undefined,
      thumbnail: (livestream.thumbnailUrl as string) ?? undefined,
      is_live: true,
      timestamp: int_or_none(livestream.createdAt, 1000) ?? undefined,
      view_count: int_or_none(livestream.watchingCount) ?? undefined,
    };
  }
}

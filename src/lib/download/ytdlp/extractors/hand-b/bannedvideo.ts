/**
 * BannedVideoIE — aligned with yt-dlp bannedvideo.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none, unified_timestamp, url_or_none } from '../../utils';

const GRAPHQL_GET_METADATA_QUERY = `
query GetVideoAndComments($id: String!) {
    getVideo(id: $id) {
        streamUrl
        directUrl
        unlisted
        live
        tags {
            name
        }
        title
        summary
        playCount
        largeImage
        videoDuration
        channel {
            _id
            title
        }
        createdAt
    }
    getVideoComments(id: $id, limit: 999999, offset: 0) {
        _id
        content
        user {
            _id
            username
        }
        voteCount {
            positive
        }
        createdAt
        replyCount
    }
}`;

export class BannedVideoIE extends InfoExtractor {
  static IE_NAME = 'banned.video';
  static _VALID_URL = /https?:\/\/(?:www\.)?banned\.video\/watch\?id=(?<id>[0-f]{24})/i;

  private async _callApi(videoId: string, idVar: string, note: string): Promise<Record<string, unknown>> {
    const resp = await this._download_json<{ data?: Record<string, unknown> }>(
      'https://api.infowarsmedia.com/graphql',
      videoId,
      note,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        data: JSON.stringify({
          variables: { id: idVar },
          operationName: 'GetVideoAndComments',
          query: GRAPHQL_GET_METADATA_QUERY,
        }),
      },
    );
    return resp.data || {};
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoJson = await this._callApi(videoId, videoId, 'Downloading video metadata');
    const videoInfo = (videoJson.getVideo as Record<string, unknown>) || {};
    const isLive = !!videoInfo.live;

    const formats: Format[] = [];
    const directUrl = url_or_none(videoInfo.directUrl);
    if (directUrl) {
      formats.push({ format_id: 'direct', quality: 1, url: directUrl, ext: 'mp4' });
    }
    if (videoInfo.streamUrl) {
      formats.push(
        ...(await this._extract_m3u8_formats(
          String(videoInfo.streamUrl),
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
        )),
      );
    }

    const title = String(videoInfo.title || '');

    return {
      id: videoId,
      title: title.length ? title.slice(0, -1) : title,
      formats,
      is_live: isLive,
      description: videoInfo.summary ? String(videoInfo.summary) : undefined,
      channel: (videoInfo.channel as Record<string, unknown>)?.title
        ? String((videoInfo.channel as Record<string, unknown>).title)
        : undefined,
      channel_id: (videoInfo.channel as Record<string, unknown>)?._id
        ? String((videoInfo.channel as Record<string, unknown>)._id)
        : undefined,
      view_count: int_or_none(videoInfo.playCount) ?? undefined,
      thumbnail: url_or_none(videoInfo.largeImage) || undefined,
      duration: float_or_none(videoInfo.videoDuration) ?? undefined,
      timestamp: unified_timestamp(videoInfo.createdAt) ?? undefined,
      tags: ((videoInfo.tags as Record<string, unknown>[]) || []).map((t) => String(t.name)),
      availability: videoInfo.unlisted ? 'unlisted' : 'public',
      webpage_url: url,
      original_url: url,
      extractor: 'banned.video',
      extractor_key: 'BannedVideo',
    };
  }
}

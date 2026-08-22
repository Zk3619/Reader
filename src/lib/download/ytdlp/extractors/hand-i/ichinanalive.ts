/**
 * IchinanaLiveIE / IchinanaLiveClipIE / IchinanaLiveVODIE — ported from yt-dlp ichinanalive.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { str_or_none, traverse_obj, unified_strdate, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class IchinanaLiveIE extends InfoExtractor {
  static IE_NAME = '17live';
  static _VALID_URL = /https?:\/\/(?:www\.)?17\.live\/(?:[^/]+\/)*(?:live|profile\/r)\/(?<id>\d+)/;

  static suitable(url: string): boolean {
    return !IchinanaLiveClipIE.suitable(url) && super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const liveUrl = `https://17.live/live/${videoId}`;

    const enter = await this._download_json<{ message?: string }>(
      `https://api-dsa.17app.co/api/v1/lives/${videoId}/enter`,
      videoId,
      undefined,
      {
        headers: { Referer: liveUrl },
        fatal: false,
        data: '\0',
      },
    );
    if (enter?.message === 'ended') {
      throw new ExtractorError('This live has ended.', { expected: true });
    }

    const viewData = await this._download_json<Record<string, unknown>>(
      `https://api-dsa.17app.co/api/v1/lives/${videoId}`,
      videoId,
      undefined,
      { headers: { Referer: liveUrl } },
    );

    const uploader =
      (traverse_obj(viewData, ['userInfo', 'displayName']) as string | undefined) ||
      (traverse_obj(viewData, ['userInfo', 'openID']) as string | undefined);

    const rtmpUrls = viewData.rtmpUrls as Array<Record<string, unknown>> | undefined;
    if (!rtmpUrls?.[0]) {
      throw new ExtractorError('unable to extract live URL information', { expected: true });
    }

    const formats: Format[] = [];
    for (const [name, value] of Object.entries(rtmpUrls[0]!)) {
      if (typeof value !== 'string' || !value.startsWith('http')) continue;
      let quality = -1;
      if (name.includes('web')) quality -= 1;
      if (name.includes('High')) quality += 4;
      if (name.includes('Low')) quality -= 2;
      formats.push({
        format_id: name,
        url: value,
        quality,
        http_headers: { Referer: liveUrl },
        ext: 'flv',
        vcodec: 'h264',
        acodec: 'aac',
      });
    }

    return {
      id: videoId,
      title: uploader || videoId,
      formats,
      is_live: true,
      uploader,
      uploader_id: videoId,
      like_count: viewData.receivedLikeCount as number | undefined,
      view_count: viewData.viewerCount as number | undefined,
      thumbnail: viewData.coverPhoto as string | undefined,
      description: viewData.caption as string | undefined,
      timestamp: viewData.beginTime as number | undefined,
    };
  }
}

export class IchinanaLiveClipIE extends InfoExtractor {
  static IE_NAME = '17live:clip';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?17\.live\/(?:[^/]+\/)*profile\/r\/(?<uploader_id>\d+)\/clip\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const uploaderId = m.groups!.uploader_id!;
    const videoId = m.groups!.id!;
    const clipUrl = `https://17.live/profile/r/${uploaderId}/clip/${videoId}`;

    const viewData = await this._download_json<Record<string, unknown>>(
      `https://api-dsa.17app.co/api/v1/clips/${videoId}`,
      videoId,
      undefined,
      { headers: { Referer: clipUrl } },
    );

    const uploader =
      (traverse_obj(viewData, ['userInfo', 'displayName']) as string | undefined) ||
      (traverse_obj(viewData, ['userInfo', 'name']) as string | undefined);

    const formats: Format[] = [];
    if (viewData.videoURL) {
      formats.push({ format_id: 'video', url: String(viewData.videoURL), quality: -1 });
    }
    if (viewData.transcodeURL) {
      formats.push({ format_id: 'transcode', url: String(viewData.transcodeURL), quality: -1 });
    }
    if (viewData.srcVideoURL) {
      formats.push({ format_id: 'srcVideo', url: String(viewData.srcVideoURL), quality: 1 });
    }

    for (const fmt of formats) {
      Object.assign(fmt, {
        ext: 'mp4',
        protocol: 'https',
        vcodec: 'h264',
        acodec: 'aac',
        http_headers: { Referer: clipUrl },
      });
    }

    return {
      id: videoId,
      title: uploader || videoId,
      formats,
      uploader,
      uploader_id: uploaderId,
      like_count: viewData.likeCount as number | undefined,
      view_count: viewData.viewCount as number | undefined,
      thumbnail: viewData.imageURL as string | undefined,
      duration: viewData.duration as number | undefined,
      description: viewData.caption as string | undefined,
      upload_date: unified_strdate(str_or_none(viewData.createdAt)) ?? undefined,
    };
  }
}

export class IchinanaLiveVODIE extends InfoExtractor {
  static IE_NAME = '17live:vod';
  static _VALID_URL = /https?:\/\/(?:www\.)?17\.live\/ja\/vod\/[^/?#]+\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const jsonData = await this._download_json<Record<string, unknown>>(
      `https://wap-api.17app.co/api/v1/vods/${videoId}`,
      videoId,
    );

    const vodUrl = url_or_none(jsonData.vodURL);
    let formats: Format[] = [];
    if (vodUrl) {
      const res = await extractM3u8FormatsAndSubtitles(this, vodUrl, videoId);
      formats = res.formats;
    }

    return {
      id: String(jsonData.vodID ?? videoId),
      title: jsonData.title as string | undefined,
      formats,
      uploader: traverse_obj(jsonData, ['userInfo', 'displayName']) as string | undefined,
      uploader_id: str_or_none(traverse_obj(jsonData, ['userInfo', 'roomID'])),
      channel: traverse_obj(jsonData, ['userInfo', 'name']) as string | undefined,
      channel_id: traverse_obj(jsonData, ['userInfo', 'userID']) as string | undefined,
      like_count: jsonData.likeCount as number | undefined,
      view_count: jsonData.viewCount as number | undefined,
      thumbnail: url_or_none(jsonData.imageURL) ?? undefined,
      duration: jsonData.duration as number | undefined,
      description: jsonData.description as string | undefined,
      timestamp: jsonData.createdAt as number | undefined,
    };
  }
}

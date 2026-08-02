/**
 * ToutiaoIE — ported from yt-dlp toutiao.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';

export class ToutiaoIE extends InfoExtractor {
  static IE_NAME = 'toutiao';
  static _VALID_URL = /https?:\/\/www\.toutiao\.com\/video\/(?<id>\d+)\/?(?:[?#]|$)/;

  async _real_initialize(): Promise<void> {
    if (this._get_cookies('https://www.toutiao.com').ttwid) return;

    const urlh = await this._request_webpage(
      'https://ttwid.bytedance.com/ttwid/union/register/',
      undefined,
      'Fetching ttwid',
      {
        fatal: false,
        headers: { 'Content-Type': 'application/json' },
      },
    );
    if (!urlh) throw new ExtractorError('Unable to fetch ttwid', { expected: true });

    try {
      await this._request_webpage(
        {
          url: 'https://ttwid.bytedance.com/ttwid/union/register/',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({
            aid: 24,
            needFid: false,
            region: 'cn',
            service: 'www.toutiao.com',
            union: true,
          }),
        },
        undefined,
        'Fetching ttwid',
      );
    } catch {
      /* cookie may still be set */
    }

    const ttwid = this._get_cookies('https://www.toutiao.com').ttwid;
    if (!ttwid) this.raise_login_required();
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const renderMatch = webpage.match(
      /<script[^>]+id=["']RENDER_DATA["'][^>]*>([^<]+)<\/script>/i,
    );
    let videoData: Record<string, unknown> = {};
    if (renderMatch?.[1]) {
      try {
        const decoded = decodeURIComponent(renderMatch[1]);
        const parsed = JSON.parse(decoded) as Record<string, unknown>;
        videoData = (traverse_obj(parsed, ['data', 'initialVideo']) as Record<string, unknown>) || {};
      } catch {
        /* ignore */
      }
    }

    const formats: Format[] = [];
    const videoList = traverse_obj(videoData, ['videoPlayInfo', 'video_list']) as
      | Array<Record<string, unknown>>
      | undefined;
    for (const video of videoList || []) {
      const mainUrl = video.main_url as string | undefined;
      if (!mainUrl) continue;
      const meta = (video.video_meta || {}) as Record<string, unknown>;
      formats.push({
        url: mainUrl,
        acodec: str_or_none(meta.audio_profile) || undefined,
        asr: int_or_none(meta.audio_sample_rate) ?? undefined,
        audio_channels: int_or_none(meta.audio_channels) ?? undefined,
        ext: str_or_none(meta.vtype) || undefined,
        filesize: int_or_none(meta.size) ?? undefined,
        format_id: str_or_none(meta.definition) ?? `${formats.length}`,
        fps: int_or_none(meta.fps) ?? undefined,
        height: int_or_none(meta.vheight) ?? undefined,
        tbr: float_or_none(meta.real_bitrate, 1000) ?? undefined,
        vcodec: str_or_none(meta.codec_type) || undefined,
        width: int_or_none(meta.vwidth) ?? undefined,
      });
    }

    const userInfo = (videoData.userInfo || {}) as Record<string, unknown>;
    const playInfo = (videoData.videoPlayInfo || {}) as Record<string, unknown>;

    return {
      id: videoId,
      formats,
      comment_count: int_or_none(videoData.commentCount) ?? undefined,
      duration: float_or_none(playInfo.video_duration) ?? undefined,
      like_count: int_or_none(videoData.repinCount) ?? undefined,
      release_timestamp: int_or_none(videoData.publishTime) ?? undefined,
      thumbnail:
        url_or_none(videoData.poster) ||
        url_or_none(videoData.coverUrl) ||
        undefined,
      title: str_or_none(videoData.title) || videoId,
      uploader: str_or_none(userInfo.name) || undefined,
      uploader_id: str_or_none(userInfo.userId) || undefined,
      view_count: int_or_none(videoData.playCount) ?? undefined,
      webpage_url: url_or_none(videoData.detailUrl) || url,
    };
  }
}

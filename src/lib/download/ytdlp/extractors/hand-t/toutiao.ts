/**
 * ToutiaoIE — ported from yt-dlp toutiao.py
 *
 * 今日头条依赖 ttwid：POST union/register 后把 cookie 写到 `.toutiao.com`，
 * 否则网页是反爬 JS 壳，抽不到 RENDER_DATA / video_list。
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
import { splitSetCookieHeader } from '@/lib/http/cookie-jar';

function ttwidFromSetCookieHeaders(headers: Record<string, string>): string | undefined {
  const raw = headers['set-cookie'] || headers['Set-Cookie'] || '';
  if (!raw) return undefined;
  for (const line of splitSetCookieHeader(raw)) {
    const first = line.split(';')[0] || '';
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name === 'ttwid' && value) return value;
  }
  return undefined;
}

function asVideoEntries(videoList: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(videoList)) {
    return videoList.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
  }
  if (videoList && typeof videoList === 'object') {
    return Object.values(videoList as Record<string, unknown>).filter(
      (v): v is Record<string, unknown> => !!v && typeof v === 'object',
    );
  }
  return [];
}

export class ToutiaoIE extends InfoExtractor {
  static IE_NAME = 'toutiao';
  static _VALID_URL = /https?:\/\/www\.toutiao\.com\/video\/(?<id>\d+)\/?(?:[?#]|$)/;

  async _real_initialize(): Promise<void> {
    if (this._get_cookies('https://www.toutiao.com').ttwid) return;

    // yt-dlp: POST register → read ttwid from response cookies → _set_cookie('.toutiao.com', ...)
    const urlh = await this._request_webpage(
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
    if (!urlh) throw new ExtractorError('Unable to fetch ttwid', { expected: true });

    let ttwid =
      ttwidFromSetCookieHeaders(urlh.headers) ||
      this._get_cookies(urlh.url).ttwid ||
      this._get_cookies('https://ttwid.bytedance.com/').ttwid;

    // 跟随 redirect_url：回调会 Set-Cookie Domain=toutiao.com（平台 jar 也能带上）
    try {
      const body = JSON.parse(urlh.text || '{}') as { redirect_url?: string };
      const redirect = url_or_none(body.redirect_url);
      if (redirect) {
        const cb = await this._request_webpage(redirect, undefined, 'Registering ttwid cookie', {
          fatal: false,
        });
        if (cb) {
          ttwid = ttwidFromSetCookieHeaders(cb.headers) || ttwid;
        }
      }
    } catch {
      /* ignore parse / callback errors — still try register Set-Cookie */
    }

    if (!ttwid) this.raise_login_required();

    await this._set_cookie('.toutiao.com', 'ttwid', ttwid);
    try {
      const { saveSetCookieLines } = await import('@/lib/http/cookie-jar');
      await saveSetCookieLines(
        'https://www.toutiao.com/',
        [`ttwid=${ttwid}; Path=/; Domain=toutiao.com; Max-Age=31536000`],
      );
    } catch {
      /* ignore */
    }
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
        videoData =
          (traverse_obj(parsed, ['data', 'initialVideo']) as Record<string, unknown>) || {};
      } catch {
        /* ignore */
      }
    }

    if (!videoData || !Object.keys(videoData).length) {
      throw new ExtractorError(
        'Unable to extract Toutiao RENDER_DATA (missing ttwid or page blocked)',
        { expected: true },
      );
    }

    const formats: Format[] = [];
    const videoList = traverse_obj(videoData, ['videoPlayInfo', 'video_list']);
    for (const video of asVideoEntries(videoList)) {
      const mainUrl = str_or_none(video.main_url) || url_or_none(video.main_url);
      if (!mainUrl) continue;
      const meta = (video.video_meta || {}) as Record<string, unknown>;
      const vcodec = str_or_none(meta.codec_type) || undefined;
      const acodec = str_or_none(meta.audio_profile) || undefined;
      formats.push({
        url: mainUrl,
        // 部分清晰度 audio_profile 为空但仍是音视频合一；未知则标 unknown 便于 ba/b 识别
        acodec: acodec || (vcodec ? 'unknown' : undefined),
        asr: int_or_none(meta.audio_sample_rate) ?? undefined,
        audio_channels:
          int_or_none(meta.audio_channels) ??
          int_or_none(float_or_none(meta.audio_channels)) ??
          undefined,
        ext: str_or_none(meta.vtype) || 'mp4',
        filesize: int_or_none(meta.size) ?? undefined,
        format_id: str_or_none(meta.definition) ?? `${formats.length}`,
        fps: int_or_none(meta.fps) ?? undefined,
        height: int_or_none(meta.vheight) ?? undefined,
        tbr: float_or_none(meta.real_bitrate, 1000) ?? undefined,
        vcodec: vcodec || undefined,
        width: int_or_none(meta.vwidth) ?? undefined,
        http_headers: {
          Referer: 'https://www.toutiao.com/',
        },
      });
    }

    if (!formats.length) {
      this.raise_no_formats('No video formats found in Toutiao RENDER_DATA', true);
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
      http_headers: {
        Referer: 'https://www.toutiao.com/',
      },
    };
  }
}

/**
 * Douyu live / VOD — ported from yt-dlp douyutv.py
 *
 * Uses crypto-js (bundled) instead of PhantomJS for stream signing.
 */

import CryptoJS from 'crypto-js';
import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  js_to_json,
  str_or_none,
  traverse_obj,
  unescapeHTML,
  url_or_none,
} from '../../utils';
import { urlencodePostdata, UserNotLive, urljoin } from './_helpers';

function parseResolution(res: string | undefined): { width?: number; height?: number } {
  if (!res) return {};
  const m = res.match(/(\d+)x(\d+)/);
  if (!m) return {};
  return { width: Number(m[1]), height: Number(m[2]) };
}

export class DouyuBaseIE extends InfoExtractor {
  static IE_NAME = 'douyubase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('DouyuBaseIE is not a standalone extractor', { expected: true });
  }

  protected _calcSign(signFunc: string, videoId: string, a: string): Record<string, string> {
    void videoId;
    const b = crypto.randomUUID().replace(/-/g, '');
    const c = Math.round(Date.now() / 1000);
    let result = '';
    try {
      const fn = new Function(
        'CryptoJS',
        `${signFunc}; return ub98484234(${JSON.stringify(a)}, ${JSON.stringify(b)}, ${String(c)});`,
      );
      result = String(fn(CryptoJS));
    } catch (e) {
      throw new ExtractorError(`Douyu JS signing failed: ${(e as Error).message}`, { expected: true });
    }
    const out: Record<string, string> = {};
    new URLSearchParams(result).forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }

  protected _searchJsSignFunc(webpage: string, fatal = true): string | null {
    return this._search_regex(
      /(?:<script.*)?<script[^>]*>([\s\S]*?ub98484234[\s\S]*?)<\/script>/,
      webpage,
      'JS sign func',
      null,
      fatal,
      1,
    );
  }
}

export class DouyuTVIE extends DouyuBaseIE {
  static IE_NAME = 'DouyuTV';
  static IE_DESC = 'Douyu live';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?douyu(?:tv)?\.com\/(?:topic\/\w+\?rid=|(?:[^/]+\/))*(?<id>[A-Za-z0-9]+)/;

  protected async _getSignFunc(roomId: string, videoId: string): Promise<string> {
    const data = await this._download_json<{ data?: Record<string, string> }>(
      `https://www.douyu.com/swf_api/homeH5Enc?rids=${roomId}`,
      videoId,
      'Getting signing script',
    );
    return data.data?.[`room${roomId}`] || '';
  }

  protected _extractStreamFormats(streamFormats: Record<string, unknown>[]): Format[] {
    const formats: Format[] = [];
    for (const block of streamFormats) {
      const streamInfo = block.data as Record<string, unknown> | undefined;
      if (!streamInfo) continue;
      const rtmpUrl = str_or_none(streamInfo.rtmp_url);
      const rtmpLive = str_or_none(streamInfo.rtmp_live);
      const streamUrl = rtmpUrl ? urljoin(rtmpUrl, rtmpLive || '') : null;
      if (!streamUrl) continue;

      const rateId = int_or_none(streamInfo.rate);
      const multirates = streamInfo.multirates as Record<string, unknown>[] | undefined;
      const rateInfo = multirates?.find((v) => int_or_none(v.rate) === rateId);
      const ext = determine_ext(streamUrl);
      formats.push({
        url: streamUrl,
        format_id: rateId != null ? String(rateId) : `rate-${formats.length}`,
        ext: ext === 'm3u8' ? 'mp4' : ext,
        protocol: ext === 'm3u8' ? 'm3u8_native' : 'https',
        quality: rateId != null ? rateId % -10000 : undefined,
        format: str_or_none(rateInfo?.name) ?? undefined,
        tbr: int_or_none(rateInfo?.bit) ?? undefined,
      });
    }
    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const roomId = this._search_regex(/\$ROOM\.room_id\s*=\s*(\d+)/, webpage, 'room id')!;

    if (this._search_regex(/"videoLoop"\s*:\s*(\d+)/, webpage, 'loop', '', false) === '1') {
      throw new ExtractorError('The channel is auto-playing VODs', { expected: true });
    }
    if (this._search_regex(/\$ROOM\.show_status\s*=\s*(\d+)/, webpage, 'status', '', false) === '2') {
      throw new UserNotLive(videoId);
    }

    const params: Record<string, string | number> = {
      aid: 'wp',
      client_sys: 'wp',
      time: Math.floor(Date.now() / 1000),
    };
    const paramStr = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    params.auth = CryptoJS.MD5(`room/${roomId}?${paramStr}zNzMV1y4EMxOHS6I5WKm`).toString();

    const roomResp = await this._download_json<{ data?: Record<string, unknown> }>(
      `http://www.douyutv.com/api/v1/room/${roomId}`,
      videoId,
      'Downloading room info',
      { query: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), fatal: false },
    );
    const room = roomResp.data || {};

    if (String(room.show_status) === '2') throw new UserNotLive(videoId);

    const jsSignFunc =
      this._searchJsSignFunc(webpage, false) || (await this._getSignFunc(roomId, videoId));
    const formData: Record<string, string | number> = {
      rate: 0,
      ...this._calcSign(jsSignFunc, videoId, roomId),
    };

    const streamFormats: Record<string, unknown>[] = [
      await this._download_json<Record<string, unknown>>(
        `https://www.douyu.com/lapi/live/getH5Play/${roomId}`,
        videoId,
        'Downloading livestream format',
        { data: urlencodePostdata(formData), method: 'POST' },
      ),
    ];

    const firstData = streamFormats[0]?.data as Record<string, unknown> | undefined;
    const defaultRate = int_or_none(firstData?.rate);
    for (const rateInfo of (firstData?.multirates as Record<string, unknown>[]) || []) {
      const rateId = int_or_none(rateInfo.rate);
      if (rateId != null && rateId !== defaultRate) {
        formData.rate = rateId;
        streamFormats.push(
          await this._download_json<Record<string, unknown>>(
            `https://www.douyu.com/lapi/live/getH5Play/${roomId}`,
            videoId,
            `Downloading livestream format ${rateId}`,
            { data: urlencodePostdata(formData), method: 'POST' },
          ),
        );
      }
    }

    const roomUrl = str_or_none(room.url);
    return {
      id: roomId,
      formats: this._extractStreamFormats(streamFormats),
      is_live: true,
      display_id: roomUrl && roomUrl.length > 1 ? roomUrl.slice(1) : undefined,
      title: room.room_name ? unescapeHTML(String(room.room_name)) : undefined,
      description: str_or_none(room.show_details) ?? undefined,
      uploader: str_or_none(room.nickname) ?? undefined,
      thumbnail: url_or_none(room.room_src) ?? undefined,
    };
  }
}

export class DouyuShowIE extends DouyuBaseIE {
  static IE_NAME = 'DouyuShow';
  static _VALID_URL = /https?:\/\/v(?:mobile)?\.douyu\.com\/show\/(?<id>[0-9a-zA-Z]+)/;

  static _FORMATS: Record<string, string> = {
    super: 'Original',
    high: 'Ultra HD',
    normal: 'HD',
  };

  static _QUALITIES: Record<string, number> = {
    super: -1,
    high: -2,
    normal: -3,
  };

  static _RESOLUTIONS: Record<string, string> = {
    super: '1920x1080',
    high: '1280x720',
    normal: '852x480',
  };

  async _real_extract(url: string): Promise<VideoInfo> {
    const normalized = url.replace('vmobile.', 'v.');
    const videoId = this._match_id(normalized);
    const webpage = await this._download_webpage(normalized, videoId);

    const videoInfo =
      this._search_json<Record<string, unknown>>(
        /<script>\s*window\.\$DATA\s*=/,
        webpage,
        'video info',
        videoId,
        { transform_source: js_to_json },
      ) || {};

    const jsSignFunc = this._searchJsSignFunc(webpage)!;
    const pointId = traverse_obj(videoInfo, ['ROOM', 'point_id']) as string | number | undefined;
    const formData = {
      vid: videoId,
      ...this._calcSign(jsSignFunc, videoId, String(pointId)),
    };

    const urlInfo = await this._download_json<Record<string, unknown>>(
      'https://v.douyu.com/api/stream/getStreamUrl',
      videoId,
      'Downloading video formats',
      { data: urlencodePostdata(formData), method: 'POST' },
    );

    const formats: Format[] = [];
    const thumbVideo = traverse_obj(urlInfo, ['data', 'thumb_video']) as Record<string, unknown> | undefined;
    if (thumbVideo && typeof thumbVideo === 'object') {
      for (const [name, raw] of Object.entries(thumbVideo)) {
        const videoUrl = url_or_none((raw as Record<string, unknown>)?.url);
        if (videoUrl) {
          const ext = determine_ext(videoUrl);
          formats.push({
            format: DouyuShowIE._FORMATS[name],
            format_id: name,
            url: videoUrl,
            quality: DouyuShowIE._QUALITIES[name],
            ext: ext === 'm3u8' ? 'mp4' : ext,
            protocol: ext === 'm3u8' ? 'm3u8_native' : 'https',
            ...parseResolution(DouyuShowIE._RESOLUTIONS[name]),
          });
        } else {
          this.to_screen(
            `"${DouyuShowIE._FORMATS[name] || name}" format may require logging in.`,
          );
        }
      }
    }

    const data = (videoInfo.DATA as Record<string, unknown>) || {};
    const content = (data.content as Record<string, unknown>) || {};
    const videoTag = data.videoTag as Array<{ tagName?: string }> | undefined;

    return {
      id: videoId,
      formats,
      title: str_or_none(content.title) ?? undefined,
      uploader: str_or_none(content.author) ?? undefined,
      uploader_id: str_or_none(content.up_id) ?? undefined,
      duration: int_or_none(content.video_duration) ?? undefined,
      thumbnail: url_or_none(content.video_pic) ?? undefined,
      timestamp: int_or_none(content.create_time) ?? undefined,
      view_count: int_or_none(content.view_num) ?? undefined,
      tags: videoTag?.map((t) => str_or_none(t.tagName)).filter((t): t is string => !!t),
    };
  }
}

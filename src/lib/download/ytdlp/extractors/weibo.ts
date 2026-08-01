/**
 * WeiboIE / WeiboVideoIE — aligned with yt-dlp weibo.py
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';
import {
  int_or_none,
  mimetype2ext,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../utils';

const WEIBO_HEADERS: Record<string, string> = {
  Referer: 'https://weibo.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

function extractTopicTags(topicStruct: unknown): string[] | undefined {
  if (!Array.isArray(topicStruct)) return undefined;
  const tags = topicStruct
    .map((t) => String((t as Record<string, unknown>).topic_title || ''))
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

function stripJsonp(text: string): string {
  const m = text.match(/^[^(]+\(([\s\S]*)\)\s*;?\s*$/);
  return m?.[1]?.trim() || text.trim();
}

function parseResolution(res?: string | null): { width?: number | null; height?: number | null } {
  if (!res) return {};
  const m = res.match(/(\d+)x(\d+)/i);
  if (!m) return {};
  return { width: Number(m[1]), height: Number(m[2]) };
}

abstract class WeiboBaseIE extends InfoExtractor {
  protected async updateVisitorCookies(visitorUrl: string, videoId: string): Promise<void> {
    const headers = { Referer: visitorUrl, ...WEIBO_HEADERS };
    const chromeVer =
      this._search_regex(/Chrome\/(\d+)/, WEIBO_HEADERS['User-Agent']!, 'user agent version', '120', false) ||
      '120';

    try {
      const genText = await this._httpGetText(
        'https://passport.weibo.com/visitor/genvisitor',
        headers,
        {
          method: 'POST',
          body: new URLSearchParams({
            cb: 'gen_callback',
            fp: JSON.stringify({
              os: '1',
              browser: `Chrome${chromeVer},0,0,0`,
              fonts: 'undefined',
              screenInfo: '1920*1080*24',
              plugins: '',
            }),
          }).toString(),
        },
      );
      const genJson = this._parse_json(stripJsonp(genText), videoId, null, false) as {
        data?: { tid?: string; new_tid?: boolean; confidence?: number };
      } | null;
      const visitorData = genJson?.data;
      if (!visitorData?.tid) return;

      const query = new URLSearchParams({
        a: 'incarnate',
        t: visitorData.tid,
        w: visitorData.new_tid ? '3' : '2',
        c: String(visitorData.confidence ?? 100).padStart(3, '0'),
        gc: '',
        cb: 'cross_domain',
        from: 'weibo',
        _rand: String(Math.random()),
      });
      await this._download_webpage(
        `https://passport.weibo.com/visitor/visitor?${query}`,
        videoId,
        'Running first-visit callback',
        { headers, fatal: false },
      );
    } catch {
      /* guest cookies are best-effort */
    }
  }

  protected async weiboDownloadJson<T = Record<string, unknown>>(
    url: string,
    videoId: string,
    _note = 'Downloading JSON metadata',
    opts?: {
      data?: string;
      headers?: Record<string, string>;
      query?: Record<string, string>;
    },
  ): Promise<T> {
    const headers = { ...WEIBO_HEADERS, ...(opts?.headers || {}) };
    const finalUrl = opts?.query
      ? `${url}?${new URLSearchParams(opts.query).toString()}`
      : url;

    let webpage = await this._httpGetText(finalUrl, headers, {
      method: opts?.data ? 'POST' : 'GET',
      body: opts?.data,
    });

    if (/passport\.weibo\.com/i.test(finalUrl) || webpage.includes('passport.weibo.com')) {
      await this.updateVisitorCookies(finalUrl, videoId);
      webpage = await this._httpGetText(finalUrl, headers, {
        method: opts?.data ? 'POST' : 'GET',
        body: opts?.data,
      });
    }

    return this._parse_json(webpage, videoId) as T;
  }

  protected extractFormats(videoInfo: Record<string, unknown>): Format[] {
    const mediaInfo = traverse_obj(videoInfo, ['page_info', 'media_info']) as
      | Record<string, unknown>
      | undefined;
    if (!mediaInfo) return [];

    const playbackList = (mediaInfo.playback_list as Record<string, unknown>[]) || [];
    const formats: Format[] = [];
    for (const item of playbackList) {
      const playInfo = item.play_info as Record<string, unknown> | undefined;
      const mediaUrl = url_or_none(playInfo?.url);
      if (!mediaUrl) continue;
      formats.push({
        url: mediaUrl,
        format: str_or_none(playInfo?.quality_desc) || undefined,
        format_id: str_or_none(playInfo?.label) || String(formats.length),
        ext: mimetype2ext(String(playInfo?.mime || '')) || 'mp4',
        tbr: int_or_none(playInfo?.bitrate) ?? undefined,
        vcodec: str_or_none(playInfo?.video_codecs) || undefined,
        fps: int_or_none(playInfo?.fps),
        width: int_or_none(playInfo?.width),
        height: int_or_none(playInfo?.height),
        filesize: int_or_none(playInfo?.size),
        acodec: str_or_none(playInfo?.audio_codecs) || undefined,
        asr: int_or_none(playInfo?.audio_sample_rate),
        protocol: 'https',
        http_headers: WEIBO_HEADERS,
      });
    }

    if (!formats.length) {
      const fallbackUrls = new Set<string>();
      const walk = (obj: unknown) => {
        if (typeof obj === 'string' && /^https?:/i.test(obj) && obj.includes('label=')) {
          fallbackUrls.add(obj);
        } else if (obj && typeof obj === 'object') {
          for (const v of Object.values(obj as Record<string, unknown>)) walk(v);
        }
      };
      walk(mediaInfo);
      for (const mediaUrl of fallbackUrls) {
        const m = mediaUrl.match(/label=(\w+)&template=(\d+x\d+)/);
        const formatId = m?.[1];
        const resolution = parseResolution(m?.[2]);
        const details = ((mediaInfo.video_details as Record<string, unknown>[]) || []).find((v) =>
          String(v.label || '').startsWith(formatId || ''),
        );
        formats.push({
          url: mediaUrl,
          format_id: formatId || String(formats.length),
          ext: 'mp4',
          protocol: 'https',
          ...resolution,
          filesize: int_or_none(details?.size),
          tbr: int_or_none(details?.bitrate),
          http_headers: WEIBO_HEADERS,
        });
      }
    }

    return formats;
  }

  protected parseVideoInfo(videoInfo: Record<string, unknown>): VideoInfo {
    const videoId =
      str_or_none(videoInfo.id) ||
      str_or_none(videoInfo.id_str) ||
      str_or_none(videoInfo.mid) ||
      'weibo';
    const formats = this.extractFormats(videoInfo);
    if (!formats.length) {
      throw new ExtractorError('No Weibo formats found', { expected: true });
    }

    const mediaInfo = traverse_obj(videoInfo, ['page_info', 'media_info']) as
      | Record<string, unknown>
      | undefined;
    const rawTitle =
      str_or_none(mediaInfo?.video_title) ||
      str_or_none(mediaInfo?.kol_title) ||
      str_or_none(mediaInfo?.name);
    const title = rawTitle ? rawTitle.replace(/\n/g, ' ').slice(0, 72) : videoId;

    const user = (videoInfo.user || {}) as Record<string, unknown>;
    const profileUrl = str_or_none(user.profile_url);
    const tags = extractTopicTags(videoInfo.topic_struct);

    return {
      id: videoId,
      display_id: str_or_none(videoInfo.mblogid) || undefined,
      title,
      alt_title: rawTitle?.replace(/\n/g, ' ') || undefined,
      description: str_or_none(videoInfo.text_raw) || null,
      duration: int_or_none(mediaInfo?.duration),
      timestamp: int_or_none(mediaInfo?.video_publish_time),
      thumbnail: url_or_none(traverse_obj(videoInfo, ['page_info', 'page_pic'])) || undefined,
      uploader: str_or_none(user.screen_name) || undefined,
      uploader_id: str_or_none(user.id) || str_or_none(user.id_str) || undefined,
      uploader_url: profileUrl
        ? profileUrl.startsWith('http')
          ? profileUrl
          : `https://weibo.com/${profileUrl.replace(/^\//, '')}`
        : undefined,
      view_count: int_or_none(mediaInfo?.online_users_number),
      like_count: int_or_none(videoInfo.attitudes_count),
      repost_count: int_or_none(videoInfo.reposts_count),
      tags: tags?.length ? tags : undefined,
      formats,
      http_headers: WEIBO_HEADERS,
      extractor: 'weibo',
      extractor_key: 'Weibo',
    };
  }
}

export class WeiboIE extends WeiboBaseIE {
  static IE_NAME = 'weibo';
  static IE_DESC = 'Weibo';
  static _VALID_URL =
    /https?:\/\/(?:m\.weibo\.cn\/(?:status|detail)|(?:www\.)?weibo\.com\/\d+)\/(?<id>[a-zA-Z0-9]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const meta = await this.weiboDownloadJson<Record<string, unknown>>(
      'https://weibo.com/ajax/statuses/show',
      videoId,
      'Downloading Weibo status',
      { query: { id: videoId } },
    );

    const mixItems = traverse_obj(meta, ['mix_media_info', 'items'], { get_all: true }) as
      | Record<string, unknown>[]
      | undefined;
    if (!mixItems?.length) {
      return this.parseVideoInfo(meta);
    }

    const entries = mixItems
      .filter((item) => item.type !== 'pic')
      .map((item) => {
        const data = (item.data || {}) as Record<string, unknown>;
        const mediaInfo = (data.media_info || {}) as Record<string, unknown>;
        return this.parseVideoInfo({
          id: data.object_id,
          page_info: { media_info: mediaInfo },
        });
      });

    return this.playlist_result(entries, videoId);
  }
}

export class WeiboVideoIE extends WeiboBaseIE {
  static IE_NAME = 'weibo:video';
  static IE_DESC = 'Weibo TV';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?weibo\.com\/tv\/show\/|video\.weibo\.com\/show\/?\?(?:[^#]+&)?fid=)(?<id>\d+:(?:[\da-f]{32}|\d{16,}))/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const postData = `data=${JSON.stringify({ Component_Play_Playinfo: { oid: videoId } })}`;
    const api = await this.weiboDownloadJson<{ data?: { Component_Play_Playinfo?: { mid?: string } } }>(
      'https://weibo.com/tv/api/component',
      videoId,
      'Downloading Weibo TV component',
      {
        data: postData,
        headers: { Referer: url, ...WEIBO_HEADERS },
        query: { page: `/tv/show/${videoId}` },
      },
    );
    const mid = api?.data?.Component_Play_Playinfo?.mid;
    if (!mid) {
      throw new ExtractorError('Unable to extract Weibo TV mid', { expected: true });
    }
    return this.url_result(`https://weibo.com/0/${mid}`, 'Weibo', mid);
  }
}

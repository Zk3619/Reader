// @ts-nocheck
/** WeiboBaseIE / WeiboUserIE �?ported from yt-dlp weibo.py (WeiboIE/WeiboVideoIE live in ../weibo.ts) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  mimetype2ext,
  parse_qs,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { make_archive_id, parse_resolution } from './_helpers';

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

export class WeiboBaseIE extends InfoExtractor {
  static IE_NAME = 'weibobase';
  static _VALID_URL = false as const;

  protected async _updateVisitorCookies(visitorUrl: string, videoId: string): Promise<void> {
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

  protected async _weiboDownloadJson<T = Record<string, unknown>>(
    url: string,
    videoId: string,
    note = 'Downloading JSON metadata',
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
      await this._updateVisitorCookies(finalUrl, videoId);
      webpage = await this._httpGetText(finalUrl, headers, {
        method: opts?.data ? 'POST' : 'GET',
        body: opts?.data,
      });
    }

    void note;
    return this._parse_json(webpage, videoId) as T;
  }

  protected _extractFormats(videoInfo: Record<string, unknown>): Format[] {
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
        const resolution = parse_resolution(m?.[2]);
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

  protected _parseVideoInfo(videoInfo: Record<string, unknown>): VideoInfo {
    const videoId =
      str_or_none(videoInfo.id) ||
      str_or_none(videoInfo.id_str) ||
      str_or_none(videoInfo.mid) ||
      'weibo';
    const formats = this._extractFormats(videoInfo);

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
      _old_archive_ids: [make_archive_id('WeiboMobile', videoId)],
    };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('WeiboBaseIE is not a standalone extractor', { expected: true });
  }
}

export class WeiboUserIE extends WeiboBaseIE {
  static IE_NAME = 'weibouser';
  static _VALID_URL = /https?:\/\/(?:www\.)?weibo\.com\/u\/(?<id>\d+)/;

  protected _yesPlaylist(playlistId: string, videoId: string | undefined): boolean {
    void playlistId;
    if (this.params.noplaylist && videoId) {
      this.to_screen('Downloading just the video because of --no-playlist');
      return false;
    }
    return true;
  }

  protected async _fetchPage(
    uid: string,
    cursor = '0',
    page = 1,
  ): Promise<Record<string, unknown>> {
    const resp = await this._weiboDownloadJson<{ data?: Record<string, unknown> }>(
      'https://weibo.com/ajax/profile/getWaterFallContent',
      uid,
      `Downloading videos page ${page}`,
      { query: { uid, cursor } },
    );
    return (resp.data || {}) as Record<string, unknown>;
  }

  protected async _entries(
    uid: string,
    firstPage: Record<string, unknown>,
  ): Promise<VideoInfo[]> {
    const out: VideoInfo[] = [];
    let cursor = '0';
    for (let page = 1; ; page++) {
      const response = page === 1 ? firstPage : await this._fetchPage(uid, cursor, page);
      const list = (response.list as Record<string, unknown>[]) || [];
      for (const videoInfo of list) {
        if (videoInfo && typeof videoInfo === 'object') {
          out.push(this._parseVideoInfo(videoInfo));
        }
      }
      cursor = String(response.next_cursor ?? '');
      if ((int_or_none(cursor) ?? -1) < 0) break;
    }
    return out;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const uid = this._match_id(url);
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(parse_qs(url))) {
      if (v?.length) params[k] = v[v.length - 1]!;
    }
    const videoId = params.tabtype === 'newVideo' ? params.layerid : undefined;
    if (!this._yesPlaylist(uid, videoId) && videoId) {
      return this.url_result(`https://weibo.com/${uid}/${videoId}`, 'Weibo', videoId);
    }

    const firstPage = await this._fetchPage(uid);
    const list = (firstPage.list as Record<string, unknown>[]) || [];
    const uploader = list
      .map((v) => str_or_none(traverse_obj(v, ['user', 'screen_name'])))
      .find(Boolean);

    const entries = await this._entries(uid, firstPage);
    return {
      ...this.playlist_result(
        entries,
        uid,
        uploader ? `${uploader}的视频` : undefined,
        uploader ? `${uploader}的全部视频` : undefined,
      ),
      uploader: uploader || undefined,
    };
  }
}

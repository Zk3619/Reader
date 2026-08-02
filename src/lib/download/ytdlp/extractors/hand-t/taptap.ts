/** TapTap family â€?ported from yt-dlp taptap.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

const X_UA =
  'V=1&PN=WebApp&LANG=zh_CN&VN_CODE=102&LOC=CN&PLT=PC&DS=Android&UID={uuid}&OS=Windows&OSV=10&DT=PC';
const X_UA_INTL =
  'V=1&PN=WebAppIntl2&LANG=zh_TW&VN_CODE=115&VN=0.1.0&LOC=CN&PLT=PC&DS=Android&UID={uuid}&CURR=&DT=PC&OS=Windows&OSV=NT%208.0.0';

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function joinId(a: string | undefined, b: string): string {
  return a ? `${a}_${b}` : b;
}

export class TapTapBaseIE extends InfoExtractor {
  static IE_NAME = 'taptapbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  protected _VIDEO_API = 'https://www.taptap.cn/webapiv2/video-resource/v1/multi-get';
  protected _X_UA = X_UA;
  protected _INFO_API: string | null = null;
  protected _INFO_QUERY_KEY = 'id';
  protected _DATA_PATH: string[] | null = null;
  protected _ID_PATH: unknown = null;
  protected _META_PATH: unknown = null;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TapTapBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _getApi(
    apiUrl: string,
    videoId: string,
    query: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const resp = await this._download_json<{ data?: Record<string, unknown> }>(apiUrl, videoId, undefined, {
      query: { ...query, 'X-UA': this._X_UA.replace('{uuid}', randomUuid()) },
    });
    return (resp.data as Record<string, unknown>) || {};
  }

  protected async _extractVideo(videoId: string): Promise<Partial<VideoInfo>> {
    const videoData = (
      ((await this._getApi(this._VIDEO_API, videoId, { video_ids: videoId })).list as unknown[]) || []
    )[0] as Record<string, unknown>;
    const playUrl = traverse_obj(videoData, ['play_url', 'url_h265']) || traverse_obj(videoData, ['play_url', 'url']);
    const videoUrl = url_or_none(playUrl);
    const formats: Format[] = [];
    if (videoUrl) {
      const res = await extractM3u8FormatsAndSubtitles(this, videoUrl, videoId, 'hls');
      for (const fmt of res.formats) {
        if (/^(hev|hvc|hvt)\d/i.test(String(fmt.vcodec || ''))) {
          fmt.format_id = joinId(fmt.format_id, 'h265');
        }
        formats.push(fmt);
      }
    }
    return {
      id: String(videoId),
      formats,
      duration: int_or_none(traverse_obj(videoData, ['info', 'duration'])) ?? undefined,
      thumbnail:
        url_or_none(traverse_obj(videoData, ['thumbnail', 'original_url'])) ||
        url_or_none(traverse_obj(videoData, ['thumbnail', 'url'])) ||
        undefined,
    };
  }

  protected async _extractTapTap(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const query: Record<string, string> = { [this._INFO_QUERY_KEY]: videoId };
    let data = await this._getApi(this._INFO_API!, videoId, query);
    if (this._DATA_PATH) {
      data = (traverse_obj(data, this._DATA_PATH) as Record<string, unknown>) || data;
    }
    const metainfo = (traverse_obj(data, this._META_PATH as string[]) || {}) as Record<string, unknown>;
    const ids = new Set<string>();
    const collectIds = (obj: unknown, path: unknown): void => {
      if (!path) return;
      if (Array.isArray(path)) {
        let cur: unknown = obj;
        for (const key of path) {
          if (key === '...') {
            if (Array.isArray(cur)) for (const item of cur) collectIds(item, path.slice(path.indexOf('...') + 1));
            return;
          }
          if (typeof key === 'string') cur = (cur as Record<string, unknown>)?.[key];
        }
        if (typeof cur === 'string' || typeof cur === 'number') ids.add(String(cur));
        return;
      }
    };
    // pragmatic ID collection for known path shapes
    const idPath = this._ID_PATH;
    if (Array.isArray(idPath)) {
      const walk = (obj: unknown, idx: number): void => {
        if (idx >= idPath.length) return;
        const key = idPath[idx];
        if (key === '...') {
          if (Array.isArray(obj)) for (const item of obj) walk(item, idx + 1);
          return;
        }
        if (typeof key === 'string') {
          if (idx === idPath.length - 1) {
            const v = (obj as Record<string, unknown>)?.[key];
            if (v != null) ids.add(String(v));
          } else walk((obj as Record<string, unknown>)?.[key], idx + 1);
        }
      };
      walk(data, 0);
    }

    const entries: VideoInfo[] = [];
    for (const id of ids) {
      entries.push({ ...metainfo, ...(await this._extractVideo(id)) } as VideoInfo);
    }
    return this.playlist_result(entries, videoId, str_or_none(metainfo.title) || undefined);
  }
}

export class TapTapMomentIE extends TapTapBaseIE {
  static IE_NAME = 'taptapmoment';
  static _VALID_URL = /https?:\/\/www\.taptap\.cn\/moment\/(?<id>\d+)/;
  protected _INFO_API = 'https://www.taptap.cn/webapiv2/moment/v3/detail';
  protected _ID_PATH = ['moment', 'topic', 'videos', 'video_id'];
  protected _META_PATH = ['moment'];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const query = { id: videoId };
    const data = await this._getApi(this._INFO_API!, videoId, query);
    const moment = (data.moment as Record<string, unknown>) || {};
    const topic = (moment.topic as Record<string, unknown>) || {};
    const metainfo = {
      timestamp: int_or_none(moment.created_time) ?? undefined,
      modified_timestamp: int_or_none(moment.edited_time) ?? undefined,
      uploader: str_or_none(((moment.author as Record<string, unknown>)?.user as Record<string, unknown> | undefined)?.name) ?? undefined,
      uploader_id: str_or_none(((moment.author as Record<string, unknown>)?.user as Record<string, unknown>)?.id) ?? undefined,
      title: str_or_none(topic.title) ?? undefined,
      description: str_or_none(topic.summary) ?? undefined,
    };
    const ids = new Set<string>();
    for (const v of (topic.videos as unknown[]) || []) {
      const vid = (v as Record<string, unknown>).video_id;
      if (vid != null) ids.add(String(vid));
    }
    const pin = (topic.pin_video as Record<string, unknown>)?.video_id;
    if (pin != null) ids.add(String(pin));
    const entries: VideoInfo[] = [];
    for (const id of ids) entries.push({ ...metainfo, ...(await this._extractVideo(id)) } as VideoInfo);
    return this.playlist_result(entries, videoId, metainfo.title);
  }
}

export class TapTapAppIE extends TapTapBaseIE {
  static IE_NAME = 'taptapapp';
  static _VALID_URL = /https?:\/\/www\.taptap\.cn\/app\/(?<id>\d+)/;
  protected _INFO_API = 'https://www.taptap.cn/webapiv2/app/v4/detail';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._getApi(this._INFO_API!, videoId, { id: videoId });
    const metainfo = {
      title: str_or_none(data.title) ?? undefined,
      description: clean_html(String((data.description as Record<string, unknown>)?.text ?? '')) || undefined,
    };
    const ids = new Set<string>();
    for (const block of ['app_videos', 'videos'] as const) {
      for (const v of ((data[block] as Record<string, unknown>)?.videos as unknown[]) || (data[block] as unknown[]) || []) {
        const vid = (v as Record<string, unknown>).video_id;
        if (vid != null) ids.add(String(vid));
      }
    }
    const entries: VideoInfo[] = [];
    for (const id of ids) entries.push({ ...metainfo, ...(await this._extractVideo(id)) } as VideoInfo);
    return this.playlist_result(entries, videoId, metainfo.title);
  }
}

export class TapTapIntlBaseIE extends TapTapBaseIE {
  static IE_NAME = 'taptapintlbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  protected _X_UA = X_UA_INTL;
  protected _VIDEO_API = 'https://www.taptap.io/webapiv2/video-resource/v1/multi-get';
}

export class TapTapAppIntlIE extends TapTapIntlBaseIE {
  static IE_NAME = 'taptapappintl';
  static _VALID_URL = /https?:\/\/www\.taptap\.io\/app\/(?<id>\d+)/;
  protected _INFO_API = 'https://www.taptap.io/webapiv2/i/app/v5/detail';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const raw = await this._getApi(this._INFO_API!, videoId, { id: videoId });
    const data = (raw.app as Record<string, unknown>) || raw;
    const metainfo = {
      title: str_or_none(data.title) ?? undefined,
      description: clean_html(String((data.description as Record<string, unknown>)?.text ?? '')) || undefined,
    };
    const ids = new Set<string>();
    for (const v of ((data.app_videos as Record<string, unknown>)?.videos as unknown[]) || []) {
      const vid = (v as Record<string, unknown>).video_id;
      if (vid != null) ids.add(String(vid));
    }
    const entries: VideoInfo[] = [];
    for (const id of ids) entries.push({ ...metainfo, ...(await this._extractVideo(id)) } as VideoInfo);
    return this.playlist_result(entries, videoId, metainfo.title);
  }
}

export class TapTapPostIntlIE extends TapTapIntlBaseIE {
  static IE_NAME = 'taptappostintl';
  static _VALID_URL = /https?:\/\/www\.taptap\.io\/post\/(?<id>\d+)/;
  protected _INFO_API = 'https://www.taptap.io/webapiv2/creation/post/v1/detail';
  protected _INFO_QUERY_KEY = 'id_str';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const raw = await this._getApi(this._INFO_API!, videoId, { id_str: videoId });
    const post = (raw.post as Record<string, unknown>) || raw;
    const metainfo = {
      timestamp: int_or_none(post.published_time) ?? undefined,
      modified_timestamp: int_or_none(post.edited_time) ?? undefined,
      uploader: str_or_none((post.user as Record<string, unknown>)?.name) ?? undefined,
      uploader_id: str_or_none((post.user as Record<string, unknown>)?.id) ?? undefined,
      title: str_or_none(post.title) ?? undefined,
      description: str_or_none((post.list_fields as Record<string, unknown>)?.summary) ?? undefined,
    };
    const ids = new Set<string>();
    for (const v of (post.videos as unknown[]) || []) {
      const vid = (v as Record<string, unknown>).video_id;
      if (vid != null) ids.add(String(vid));
    }
    const pin = (post.pin_video as Record<string, unknown>)?.video_id;
    if (pin != null) ids.add(String(pin));
    const entries: VideoInfo[] = [];
    for (const id of ids) entries.push({ ...metainfo, ...(await this._extractVideo(id)) } as VideoInfo);
    return this.playlist_result(entries, videoId, metainfo.title);
  }
}

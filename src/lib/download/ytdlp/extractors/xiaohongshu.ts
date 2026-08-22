/**
 * XiaoHongShuIE — aligned with yt-dlp xiaohongshu.py
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, Thumbnail, VideoInfo } from '../types';
import {
  float_or_none,
  int_or_none,
  js_to_json,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../utils';

/**
 * yt-dlp: traverse_obj(..., ('video','media','stream', ..., ...))
 * stream 形如 { h264: [entry, ...], h265: [...], ... }，需下钻到带 masterUrl 的条目。
 */
function flattenStreamGroups(noteInfo: Record<string, unknown>): Record<string, unknown>[] {
  const stream = traverse_obj(noteInfo, ['video', 'media', 'stream']);
  const out: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    // 编码档条目（有直链字段）；否则是 codec 分组容器，继续下钻
    if ('masterUrl' in obj || 'backupUrls' in obj || 'qualityType' in obj) {
      out.push(obj);
      return;
    }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(stream);
  return out;
}

function extractTagNames(tagList: unknown): string[] | undefined {
  if (!Array.isArray(tagList)) return undefined;
  const tags = tagList
    .map((t) => String((t as Record<string, unknown>).name || ''))
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

const XHS_HEADERS: Record<string, string> = {
  Referer: 'https://www.xiaohongshu.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

export class XiaoHongShuIE extends InfoExtractor {
  static IE_NAME = 'xiaohongshu';
  static IE_DESC = '小红书';
  static _VALID_URL =
    /https?:\/\/www\.xiaohongshu\.com\/(?:explore|discovery\/item)\/(?<id>[\da-f]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId, 'Downloading XiaoHongShu webpage', {
      headers: XHS_HEADERS,
    });

    const initialState = this._search_json<Record<string, unknown>>(
      /window\.__INITIAL_STATE__\s*=/,
      webpage,
      'initial state',
      displayId,
      { transform_source: js_to_json },
    );
    if (!initialState) {
      throw new ExtractorError('Unable to extract XiaoHongShu initial state', { expected: true });
    }

    const noteInfo = traverse_obj(initialState, ['note', 'noteDetailMap', displayId, 'note']) as
      | Record<string, unknown>
      | undefined;
    if (!noteInfo) {
      // 无 xsec_token 的 explore 链接常返回空 noteDetailMap（页面 404），需保留分享参数
      throw new ExtractorError(
        'Unable to extract XiaoHongShu note info (try the full share URL with xsec_token)',
        { expected: true },
      );
    }

    const streamGroups = flattenStreamGroups(noteInfo);

    const formats: Format[] = [];
    /** 同一 CDN 直链只保留一条（backup 与重复 qualityType 常指向同一文件） */
    const seenUrls = new Set<string>();
    const pushUnique = (fmt: Format) => {
      const key = String(fmt.url || '').split('?')[0] || '';
      if (!key || seenUrls.has(key)) return;
      seenUrls.add(key);
      formats.push(fmt);
    };

    for (const info of streamGroups || []) {
      if (!info || typeof info !== 'object') continue;
      const width = int_or_none(info.width);
      const height = int_or_none(info.height);
      const qualityType = str_or_none(info.qualityType) || undefined;
      const formatInfo = {
        fps: int_or_none(info.fps),
        width,
        height,
        vcodec: str_or_none(info.videoCodec) || undefined,
        acodec: str_or_none(info.audioCodec) || undefined,
        abr: int_or_none(info.audioBitrate, 1000),
        vbr: int_or_none(info.videoBitrate, 1000),
        tbr: int_or_none(info.avgBitrate, 1000),
        format: qualityType,
        format_note: qualityType,
        filesize: int_or_none(info.size),
        duration: float_or_none(info.duration, 1000),
      };

      const urls: string[] = [];
      const master = url_or_none(info.masterUrl);
      if (master) urls.push(master);
      const backups = info.backupUrls;
      if (Array.isArray(backups)) {
        for (const u of backups) {
          const bu = url_or_none(u);
          if (bu) urls.push(bu);
        }
      }
      for (const u of urls) {
        const dim =
          width && height ? `${width}x${height}` : width || height ? String(width || height) : '';
        pushUnique({
          format_id: [qualityType || 'stream', dim, String(formats.length)].filter(Boolean).join('-'),
          url: u,
          ext: 'mp4',
          protocol: 'https',
          http_headers: XHS_HEADERS,
          ...formatInfo,
        });
      }
    }

    const originKey = str_or_none(traverse_obj(noteInfo, ['video', 'consumer', 'originVideoKey']));
    if (originKey) {
      const probe = await this._request_webpage(
        `https://sns-video-bd.xhscdn.com/${originKey}`,
        displayId,
        'Checking original video availability',
        { headers: XHS_HEADERS, fatal: false },
      );
      if (probe) {
        pushUnique({
          format_id: 'direct',
          url: probe.url,
          ext: 'mp4',
          protocol: 'https',
          quality: 1,
          http_headers: XHS_HEADERS,
        });
      }
    }

    if (!formats.length) {
      const noteType = str_or_none(noteInfo.type);
      throw new ExtractorError(
        noteType && noteType !== 'video'
          ? `XiaoHongShu note has no downloadable video (type=${noteType})`
          : 'No XiaoHongShu media URL',
        { expected: true },
      );
    }

    const thumbnails: Thumbnail[] = [];
    const imageList = (noteInfo.imageList as Record<string, unknown>[]) || [];
    for (const imageInfo of imageList) {
      const thumbInfo = {
        height: int_or_none(imageInfo.height),
        width: int_or_none(imageInfo.width),
      };
      for (const key of ['urlDefault', 'urlPre'] as const) {
        const thumbUrl = url_or_none(imageInfo[key]);
        if (thumbUrl) thumbnails.push({ url: thumbUrl, ...thumbInfo });
      }
    }

    const ogTitle = this._html_search_meta(['og:title'], webpage, 'title', false);
    const title =
      str_or_none(noteInfo.title) || str_or_none(noteInfo.desc) || ogTitle || displayId;
    const tags = extractTagNames(noteInfo.tagList);

    return {
      id: displayId,
      title,
      description: str_or_none(noteInfo.desc) || null,
      tags: tags?.length ? tags : undefined,
      uploader_id: str_or_none(traverse_obj(noteInfo, ['user', 'userId'])) || undefined,
      formats,
      thumbnails: thumbnails.length ? thumbnails : undefined,
      thumbnail: thumbnails[0]?.url,
      duration: (() => {
        const d = formats.find((f) => f.duration != null)?.duration;
        return typeof d === 'number' ? d : null;
      })(),
      webpage_url: url,
      original_url: url,
      extractor: 'xiaohongshu',
      extractor_key: 'XiaoHongShu',
      http_headers: XHS_HEADERS,
    };
  }
}

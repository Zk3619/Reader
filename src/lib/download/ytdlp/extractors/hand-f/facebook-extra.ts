/**
 * FacebookPluginsVideo / FacebookRedirectURL / FacebookAds â€?yt-dlp facebook.py siblings
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  parse_qs,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { qualityRank } from './_helpers';

const FORMATS_MAP: Record<string, [string, string | null]> = {
  watermarked_video_sd_url: ['sd-wmk', 'SD, watermarked'],
  video_sd_url: ['sd', null],
  watermarked_video_hd_url: ['hd-wmk', 'HD, watermarked'],
  video_hd_url: ['hd', null],
};

const formatQuality = qualityRank(Object.keys(FORMATS_MAP));

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export class FacebookPluginsVideoIE extends InfoExtractor {
  static IE_NAME = 'facebookpluginsvideo';
  static _VALID_URL =
    /https?:\/\/(?:[\w-]+\.)?facebook\.com\/plugins\/video\.php\?.*?\bhref=(?<id>https.+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const target = decodeURIComponentSafe(this._match_id(url));
    return this.url_result(target, 'Facebook');
  }
}

export class FacebookRedirectURLIE extends InfoExtractor {
  static IE_NAME = 'facebookredirecturl';
  static _VALID_URL = /https?:\/\/(?:[\w-]+\.)?facebook\.com\/flx\/warn[/?]/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const qs = parse_qs(url);
    const uList = qs.u;
    const redirectUrl = url_or_none(uList?.[uList.length - 1]);
    if (!redirectUrl) {
      throw new ExtractorError('Invalid facebook redirect URL', { expected: true });
    }
    return this.url_result(redirectUrl);
  }
}

export class FacebookAdsIE extends InfoExtractor {
  static IE_NAME = 'facebook:ads';
  static _VALID_URL =
    /https?:\/\/(?:[\w-]+\.)?facebook\.com\/ads\/library\/?\?(?:[^#]+&)?id=(?<id>\d+)/;

  protected _extractFormats(videoDict: Record<string, unknown>): Format[] {
    const formats: Format[] = [];
    for (const [formatKey, formatUrl] of Object.entries(videoDict)) {
      const mapped = FORMATS_MAP[formatKey];
      const resolved = url_or_none(formatUrl);
      if (!mapped || !resolved) continue;
      formats.push({
        format_id: mapped[0],
        format_note: mapped[1] ?? undefined,
        url: resolved,
        ext: 'mp4',
        quality: formatQuality(formatKey),
      });
    }
    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const postData: Record<string, unknown>[] = [];
    for (const m of webpage.matchAll(/data-sjs>(\{.*?ScheduledServerJS.*?\})<\/script>/gs)) {
      try {
        postData.push(JSON.parse(m[1]!) as Record<string, unknown>);
      } catch {
        /* skip */
      }
    }

    let data: Record<string, unknown> | undefined;
    for (const block of postData) {
      const requireArr = block.require as unknown;
      if (!Array.isArray(requireArr)) continue;
      for (const req of requireArr) {
        if (!Array.isArray(req)) continue;
        for (const inner of req) {
          if (!Array.isArray(inner)) continue;
          for (const leaf of inner) {
            if (!leaf || typeof leaf !== 'object') continue;
            const bbox = (leaf as Record<string, unknown>).__bbox as Record<string, unknown> | undefined;
            const result = bbox?.result as Record<string, unknown> | undefined;
            const adMain = result?.data as Record<string, unknown> | undefined;
            const deeplink =
              (adMain?.ad_library_main as Record<string, unknown> | undefined)?.deeplink_ad_archive_result as
                | Record<string, unknown>
                | undefined;
            const snapshot =
              (deeplink?.deeplink_ad_archive as Record<string, unknown> | undefined)?.snapshot ||
              (result?.entryPointRoot as Record<string, unknown> | undefined)?.otherProps as
                | Record<string, unknown>
                | undefined;
            const snap = (snapshot as Record<string, unknown> | undefined)?.deeplinkAdCard as
              | Record<string, unknown>
              | undefined;
            const candidate = (deeplink?.deeplink_ad_archive as Record<string, unknown> | undefined)?.snapshot ||
              snap;
            if (candidate && typeof candidate === 'object') {
              data = candidate as Record<string, unknown>;
              break;
            }
          }
          if (data) break;
        }
        if (data) break;
      }
      if (data) break;
    }

    if (!data) {
      throw new ExtractorError('Unable to extract ad data', { expected: true });
    }

    let title = str_or_none(data.title);
    if (!title || title === '{{product.name}}') {
      const displayFmt = str_or_none(data.display_format);
      const pageName = str_or_none(data.page_name);
      title = displayFmt && pageName ? `${displayFmt} by ${pageName}` : displayFmt || pageName;
    }

    const markupId = str_or_none((data.body as Record<string, unknown> | undefined)?.__m);
    let markup: string | null = null;
    if (markupId) {
      for (const block of postData) {
        const requireArr = block.require as unknown;
        if (!Array.isArray(requireArr)) continue;
        const walk = (node: unknown): string | null => {
          if (!node || typeof node !== 'object') return null;
          if (Array.isArray(node)) {
            for (const item of node) {
              const found = walk(item);
              if (found) return found;
            }
            return null;
          }
          const rec = node as Record<string, unknown>;
          const bbox = rec.__bbox as Record<string, unknown> | undefined;
          const markupArr = bbox?.markup as unknown;
          if (Array.isArray(markupArr) && markupArr[0] === markupId) {
            const html = traverse_obj(markupArr, [1, '__html', String]) as string | undefined;
            const cleaned = html ? clean_html(html) : null;
            if (cleaned && !cleaned.startsWith('{{product.')) return cleaned;
          }
          for (const v of Object.values(rec)) {
            const found = walk(v);
            if (found) return found;
          }
          return null;
        };
        markup = walk(requireArr);
        if (markup) break;
      }
    }

    const infoDict: VideoInfo = {
      id: videoId,
      title: title || videoId,
      description:
        markup ||
        str_or_none((data.body as Record<string, unknown> | undefined)?.text) ||
        str_or_none(data.link_description) ||
        undefined,
      uploader: str_or_none(data.page_name) ?? undefined,
      uploader_id: str_or_none(data.page_id) ?? undefined,
      uploader_url: url_or_none(data.page_profile_uri) ?? undefined,
      like_count: int_or_none(data.page_like_count) ?? undefined,
    };

    const videoSources = [
      ...(Array.isArray(data.videos) ? data.videos : []),
      ...(Array.isArray(data.cards) ? data.cards : []),
    ] as Record<string, unknown>[];

    const entries: VideoInfo[] = [];
    let idx = 0;
    for (const entry of videoSources) {
      if (!Object.keys(FORMATS_MAP).some((k) => url_or_none(entry[k]))) continue;
      idx += 1;
      entries.push({
        id: `${videoId}_${idx}`,
        title: str_or_none(entry.title) || infoDict.title,
        description:
          str_or_none((entry.body as Record<string, unknown> | undefined)?.link_description) ||
          infoDict.description,
        thumbnail: url_or_none(entry.video_preview_image_url) ?? undefined,
        formats: this._extractFormats(entry),
      });
    }

    if (entries.length === 1) {
      Object.assign(infoDict, entries[0]);
    } else if (entries.length > 1) {
      infoDict.title = entries[0]!.title;
      infoDict.entries = entries;
      infoDict._type = 'playlist';
    }

    return infoDict;
  }
}

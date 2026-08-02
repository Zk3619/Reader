/** SproutVideoIE / VidsIoIE — ported from yt-dlp sproutvideo.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  extract_attributes,
  int_or_none,
  remove_start,
  smuggle_url,
  traverse_obj,
  unsmuggle_url,
  update_url_query,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

function policyToQs(
  policy: Record<string, unknown>,
  signatureKey: string,
  asString = false,
): Record<string, string> | string {
  const sigs = (policy.signatures as Record<string, Record<string, string>>)?.[signatureKey] || {};
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(sigs)) {
    query[remove_start(key, 'CloudFront-') || key] = value;
  }
  query.sessionID = String(policy.sessionID || '');
  if (asString) return new URLSearchParams(query).toString();
  return query;
}

function hiddenInputs(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]+type=["']hidden["'][^>]*>/gi)) {
    const attrs = extract_attributes(m[0]!);
    if (attrs.name) out[attrs.name] = attrs.value || '';
  }
  return out;
}

const QUALITY_ORDER = ['hd', 'uhd', 'source'];

function qualityRank(id: string): number {
  const idx = QUALITY_ORDER.indexOf(id);
  return idx >= 0 ? QUALITY_ORDER.length - idx : 0;
}

export class SproutVideoIE extends InfoExtractor {
  static IE_NAME = 'sproutvideo';
  static _VALID_URL = /https?:\/\/videos\.sproutvideo\.com\/embed\/(?<id>[\da-f]+)\/[\da-f]+/;
  static _M3U8_URL_TMPL = 'https://{base}.videos.sproutvideo.com/{s3_user_hash}/{s3_video_hash}/video/index.m3u8';

  async _real_extract(url: string): Promise<VideoInfo> {
    const [rawUrl, smuggled] = unsmuggle_url(url, {});
    const videoId = this._match_id(rawUrl);
    const referer = traverse_obj(smuggled, ['referer']) as string | undefined;
    const webpage = await this._download_webpage(rawUrl, videoId, undefined, {
      headers: referer ? { Referer: referer } : undefined,
    });

    const b64 = this._search_regex(
      /(?:window\.|(?:var|const|let)\s+)(?:dat|(?:player|video)Info|)\s*=\s*["']([A-Za-z0-9+/=]+)["']/,
      webpage,
      'player info',
      videoId,
    )!;
    const data = JSON.parse(atob(b64)) as Record<string, unknown>;

    const videoUid = String(data.videoUid || '');
    if (videoId !== videoUid) {
      throw new ExtractorError(`${this.IE_NAME} sent the wrong video data (${videoUid})`);
    }

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const headers: Record<string, string> = {
      Accept: '*/*',
      Origin: 'https://videos.sproutvideo.com',
      Referer: rawUrl,
    };

    if (traverse_obj(data, ['hls'])) {
      const manifestQuery = policyToQs(data, 'm') as Record<string, string>;
      const fragmentQuery = policyToQs(data, 't', true) as string;
      const keyQuery = policyToQs(data, 'k', true) as string;
      const m3u8Url = SproutVideoIE._M3U8_URL_TMPL.replace('{base}', String(data.base))
        .replace('{s3_user_hash}', String(data.s3_user_hash))
        .replace('{s3_video_hash}', String(data.s3_video_hash));

      const res = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');
      for (const fmt of res.formats) {
        formats.push({
          ...fmt,
          url: update_url_query(fmt.url || '', manifestQuery),
          extra_param_to_segment_url: fragmentQuery,
          extra_param_to_key_url: keyQuery,
        });
      }
    }

    const downloads = traverse_obj(data, ['downloads']) as Record<string, string> | undefined;
    if (downloads) {
      const acodec = data.has_audio === false ? 'none' : undefined;
      for (const [formatId, formatUrl] of Object.entries(downloads)) {
        if (!url_or_none(formatUrl)) continue;
        formats.push({
          format_id: formatId,
          url: formatUrl,
          ext: 'mp4',
          quality: qualityRank(formatId),
          acodec,
        });
      }
    }

    for (const subData of traverse_obj(data, ['subtitleData']) as Record<string, unknown>[] | undefined || []) {
      const src = url_or_none(subData.src);
      if (!src) continue;
      const lang = String(subData.srclang || 'en');
      (subtitles[lang] ||= []).push({ url: src, ext: 'vtt' });
    }

    return {
      id: videoId,
      formats,
      subtitles,
      http_headers: headers,
      title: traverse_obj(data, ['title']) as string | undefined,
      duration: int_or_none(data.duration) ?? undefined,
      thumbnail: url_or_none(data.posterframe_url) || undefined,
    };
  }
}

export class VidsIoIE extends InfoExtractor {
  static IE_NAME = 'vids.io';
  static _VALID_URL = /https?:\/\/[\w-]+\.vids\.io\/videos\/(?<id>[\da-f]+)\/(?<display_id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.display_id!;

    let webpage = await this._download_webpage(url, displayId, undefined, { fatal: false });
    if (!webpage) {
      throw new ExtractorError('Unable to download webpage', { expected: true });
    }

    const password = this.params.videopassword as string | undefined;
    if (/password-protected/i.test(webpage) || (webpage.length < 500 && password)) {
      if (!password) {
        throw new ExtractorError(
          'This video is password-protected; use the --video-password option',
          { expected: true },
        );
      }
      const postData = new URLSearchParams({ password, ...hiddenInputs(webpage) }).toString();
      try {
        webpage = await this._httpGetText(url, { 'Content-Type': 'application/x-www-form-urlencoded' }, {
          method: 'POST',
          body: postData,
        });
      } catch {
        throw new ExtractorError('Incorrect password', { expected: true });
      }
    }

    const embedRe = new RegExp(
      String.raw`https?:?//videos\.sproutvideo\.com/embed/${videoId}/[\da-f]+`,
      'i',
    );
    const embedMatch = webpage.match(embedRe);
    if (embedMatch) {
      let embedUrl = embedMatch[0]!;
      if (embedUrl.startsWith('//')) embedUrl = `https:${embedUrl}`;
      return this.url_result(smuggle_url(embedUrl, { referer: url }), 'SproutVideo', videoId);
    }

    throw new ExtractorError('Unable to extract any SproutVideo embed url');
  }
}

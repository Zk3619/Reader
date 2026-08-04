// @ts-nocheck
/** Vbox7IE â€?ported from yt-dlp vbox7.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, merge_dicts, traverse_obj } from '../../utils';
import { url_basename } from './_helpers';

/** yt-dlp utils.base_url â€?directory prefix including trailing slash. */
function dirBaseUrl(url: string): string {
  const m = /https?:\/\/[^?#]+?\//.exec(url);
  if (!m) return url;
  const lastSlash = url.lastIndexOf('/');
  return lastSlash >= 0 ? url.slice(0, lastSlash + 1) : m[0]!;
}

export class Vbox7IE extends InfoExtractor {
  static IE_NAME = 'vbox7';
  static _GEO_COUNTRIES = ['BG'];
  static _VALID_URL =
    /https?:\/\/(?:[^/]+\.)?vbox7\.com\/(?:play:|(?:emb\/external\.php|player\/ext\.swf)\?.*?\bvid=)(?<id>[\da-fA-F]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const data = (
      await this._download_json<{ options: Record<string, unknown> }>(
        'https://www.vbox7.com/aj/player/item/options',
        videoId,
        undefined,
        { query: { vid: videoId } },
      )
    ).options;

    const srcUrl = data.src as string | undefined;
    if (srcUrl == null || srcUrl === '' || srcUrl === 'blank') {
      throw new ExtractorError('Video is unavailable', { expected: true });
    }

    const basename = url_basename(srcUrl);
    const noExt = basename.includes('.') ? basename.slice(0, basename.lastIndexOf('.')) : basename;
    let fmtBase = noExt.includes('_') ? noExt.slice(0, noExt.lastIndexOf('_')) : noExt;
    if (fmtBase === 'vn') {
      this.raise_geo_restricted(undefined, Vbox7IE._GEO_COUNTRIES);
    }

    fmtBase = dirBaseUrl(srcUrl) + fmtBase;

    const formats: Format[] = [
      ...(await this._extract_m3u8_formats(
        `${fmtBase}.m3u8`,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      )),
    ];

    const resolutions = traverse_obj(data, ['resolutions']) as unknown;
    if (Array.isArray(resolutions)) {
      for (const res of resolutions) {
        const height = int_or_none(res);
        if (!height) continue;
        formats.push({
          url: `${fmtBase}_${height}.mp4`,
          format_id: `http-${height}`,
          height,
        });
      }
    }

    const webpage =
      (await this._download_webpage(`https://www.vbox7.com/play:${videoId}`, videoId, undefined, {
        fatal: false,
      })) || '';
    const jsonLd = (this._search_json_ld(webpage, videoId, { fatal: false }) || {}) as Record<
      string,
      unknown
    >;

    return merge_dicts(jsonLd, {
      id: videoId,
      formats,
      title: (traverse_obj(data, ['title']) as string) || videoId,
      uploader: (traverse_obj(data, ['uploader']) as string) || undefined,
      duration: int_or_none(traverse_obj(data, ['duration'])) ?? undefined,
    }) as VideoInfo;
  }
}

/**
 * AdobeTVVideoIE — aligned with yt-dlp adobetv.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  float_or_none,
  int_or_none,
  join_nonempty,
  str_or_none,
  url_or_none,
} from '../../utils';

function protoRelative(url: string, scheme = 'https:'): string {
  if (url.startsWith('//')) return `${scheme}${url}`;
  return url;
}

export class AdobeTVVideoIE extends InfoExtractor {
  static IE_NAME = 'adobetv';
  static _VALID_URL = /https?:\/\/video\.tv\.adobe\.com\/v\/(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const videoData = this._search_json<Record<string, unknown>>(
      /var\s+bridge\s*=/,
      webpage,
      'bridged data',
      videoId,
    )!;

    const formats: Format[] = [];
    const sources = (videoData.sources as Record<string, unknown>[]) || [];
    for (const source of sources) {
      const src = url_or_none(source.src);
      if (!src || source.format === 'playlist') continue;
      const sourceUrl = protoRelative(src);
      const ext = determine_ext(sourceUrl);
      let fmts: Format[];
      if (ext === 'm3u8') {
        fmts = await this._extract_m3u8_formats(
          sourceUrl,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        );
      } else {
        fmts = [{ format_id: 'direct', url: sourceUrl }];
      }

      for (const fmt of fmts) {
        const formatId = join_nonempty(String(source.format || ''), String(source.label || ''));
        formats.push({
          ...fmt,
          duration: float_or_none(source.duration, 1000) ?? fmt.duration,
          filesize: int_or_none(source.kilobytes, 0.001) ?? fmt.filesize,
          format_id: formatId || fmt.format_id,
          height: int_or_none(source.height) ?? fmt.height,
          tbr: int_or_none(source.bitrate) ?? fmt.tbr,
          width: int_or_none(source.width) ?? fmt.width,
        });
      }
    }

    const subtitles: Record<string, Array<{ ext: string; url: string }>> = {};
    for (const translation of (videoData.translations as Record<string, unknown>[]) || []) {
      const vttPath = url_or_none(translation.vttPath);
      if (!vttPath) continue;
      const lang =
        str_or_none(translation.language_w3c) ||
        str_or_none(translation.language_medium) ||
        'und';
      (subtitles[lang] ||= []).push({
        ext: 'vtt',
        url: protoRelative(vttPath),
      });
    }

    const videoObj = videoData.video as Record<string, unknown> | undefined;
    const poster = videoObj?.poster as string | undefined;

    return {
      id: videoId,
      formats,
      subtitles,
      title: clean_html(String(videoData.title || videoId)) || videoId,
      description: clean_html(String(videoData.description || '')) || null,
      thumbnail: url_or_none(poster ? protoRelative(poster) : null) || undefined,
      webpage_url: url,
      original_url: url,
      extractor: AdobeTVVideoIE.IE_NAME,
      extractor_key: 'AdobeTVVideo',
    };
  }
}

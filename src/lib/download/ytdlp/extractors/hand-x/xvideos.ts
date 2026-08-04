// @ts-nocheck
/** XVideosIE / XVideosQuickiesIE â€?ported from yt-dlp xvideos.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { clean_html, determine_ext, int_or_none, parse_duration } from '../../utils';

export class XVideosIE extends InfoExtractor {
  static IE_NAME = 'XVideos';
  static _VALID_URL =
    /https?:\/\/(?:(?:[^/]+\.)?xvideos2?\.com\/video\.?|(?:www\.)?xvideos\.es\/video\.?|(?:www|flashservice)\.xvideos\.com\/embedframe\/|static-hw\.xvideos\.com\/swf\/xv-player\.swf\?.*?\bid_video=)(?<id>[0-9a-z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const errM = webpage.match(/<h1 class="inlineError">(.+?)<\/h1>/);
    if (errM) {
      throw new ExtractorError(
        `${this.IE_NAME} said: ${clean_html(errM[1]) || errM[1]}`,
        { expected: true },
      );
    }

    const title =
      this._html_search_regex(
        [
          /<title>(?<title>.+?)\s+-\s+XVID/,
          /setVideoTitle\s*\(\s*(["'])(?<title>(?:(?!\1).)+)\1/,
        ],
        webpage,
        'title',
        null,
        false,
        'title',
      ) ||
      this._og_search_title(webpage) ||
      videoId;

    const thumbnails: Thumbnail[] = [];
    for (const [preference, thumbnailSuffix] of [
      [0, ''],
      [1, '169'],
    ] as const) {
      const thumbnailUrl = this._search_regex(
        new RegExp(
          `setThumbUrl${thumbnailSuffix}\\(\\s*(["'])(?<thumbnail>(?:(?!\\1).)+)\\1`,
        ),
        webpage,
        'thumbnail',
        null,
        false,
        'thumbnail',
      );
      if (thumbnailUrl) {
        thumbnails.push({ url: thumbnailUrl, preference });
      }
    }

    const duration =
      int_or_none(this._og_search_property('duration', webpage)) ??
      parse_duration(
        this._search_regex(
          /<span[^>]+class=["']duration["'][^>]*>.*?(\d[^<]+)/,
          webpage,
          'duration',
          null,
          false,
        ),
      ) ??
      undefined;

    const formats: Format[] = [];

    const flvEncoded = this._search_regex(/flv_url=(.+?)&/, webpage, 'video URL', '', false);
    const videoUrl = flvEncoded ? decodeURIComponent(flvEncoded) : '';
    if (videoUrl) {
      formats.push({ url: videoUrl, format_id: 'flv' });
    }

    for (const m of webpage.matchAll(/setVideo([^(]+)\((["'])(http.+?)\2\)/g)) {
      const formatId = m[1]!.toLowerCase();
      const formatUrl = m[3]!;
      if (formatId === 'hls') {
        // Upstream also _check_formats; URL reachability probe not ported.
        formats.push(
          ...(await this._extract_m3u8_formats(
            formatUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          )),
        );
      } else if (formatId === 'urllow' || formatId === 'urlhigh') {
        formats.push({
          url: formatUrl,
          format_id: `${determine_ext(formatUrl, 'mp4')}-${formatId.slice(3)}`,
          quality: formatId.endsWith('low') ? -2 : undefined,
        });
      }
    }

    return {
      id: videoId,
      formats,
      title,
      duration: duration ?? undefined,
      thumbnails: thumbnails.length ? thumbnails : undefined,
      age_limit: 18,
    };
  }
}

export class XVideosQuickiesIE extends InfoExtractor {
  static IE_NAME = 'xvideos:quickies';
  static _VALID_URL =
    /https?:\/\/(?<domain>(?:[^/?#]+\.)?xvideos2?\.com)\/(?:profiles\/|amateur-channels\/)?[^/?#]+#quickies\/a\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const domain = m.groups!.domain!;
    const id_ = m.groups!.id!;
    const dot = /^\d+$/.test(id_) ? '' : '.';
    return this.url_result(`https://${domain}/video${dot}${id_}/_`, 'XVideos', id_);
  }
}

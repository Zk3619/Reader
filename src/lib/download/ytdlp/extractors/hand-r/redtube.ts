/** RedTubeIE — ported from yt-dlp redtube.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  merge_dicts,
  str_to_int,
  unified_strdate,
  url_or_none,
} from '../../utils';
import { urljoin } from './_helpers';

export class RedTubeIE extends InfoExtractor {
  static IE_NAME = 'RedTube';
  static _VALID_URL =
    /https?:\/\/(?:(?:\w+\.)?redtube\.com(?:\.br)?\/|embed\.redtube\.com\/\?.*?\bid=)(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`https://www.redtube.com/${videoId}`, videoId);

    const errors: Array<[string[], string]> = [
      [['video-deleted-info', '>This video has been removed'], 'has been removed'],
      [
        ['private_video_text', '>This video is private', '>Send a friend request to its owner to be able to view it'],
        'is private',
      ],
    ];
    for (const [patterns, message] of errors) {
      if (patterns.some((p) => webpage.includes(p))) {
        throw new ExtractorError(`Video ${videoId} ${message}`, { expected: true });
      }
    }

    const info = (this._search_json_ld(webpage, videoId, { fatal: false }) || {}) as Partial<VideoInfo>;

    if (!info.title) {
      info.title =
        this._html_search_regex(
          [
            /<h1[^>]+class="(?:video_title_text|videoTitle|video_title)[^"]*">(?<title>[\s\S]+?)<\/h1>/,
            /<h2[^>]+class="(?:video_title_text|videoTitle|video_title)[^"]*">(?<title>[\s\S]+?)<\/h2>/,
            /<h3[^>]+class="(?:video_title_text|videoTitle|video_title)[^"]*">(?<title>[\s\S]+?)<\/h3>/,
            /(?:videoTitle|title)\s*:\s*["'](?<title>[\s\S]+?)["']/,
          ],
          webpage,
          'title',
          null,
          false,
          'title',
        ) ||
        this._og_search_title(webpage) ||
        undefined;
    }

    const formats: Format[] = [];
    const sourcesRaw = this._search_regex(/sources\s*:\s*(\{[\s\S]+?\})/, webpage, 'source', '{}', false);
    const sources = this._parse_json(sourcesRaw || '{}', videoId, undefined, false) as Record<string, string>;
    if (sources && typeof sources === 'object') {
      for (const [formatId, formatUrl] of Object.entries(sources)) {
        if (formatUrl) formats.push({ url: formatUrl, format_id: formatId, height: int_or_none(formatId) ?? undefined });
      }
    }

    const mediasRaw = this._search_regex(/mediaDefinition["']?\s*:\s*(\[[\s\S]+?\}\s*\])/, webpage, 'media definitions', '{}', false);
    const medias = this._parse_json(mediasRaw || '{}', videoId, undefined, false);
    const mediaList = Array.isArray(medias) ? medias : [];
    for (const media of mediaList) {
      let formatUrl = urljoin('https://www.redtube.com', media.videoUrl as string);
      if (!formatUrl) continue;
      let formatId = media.format as string | undefined;
      const quality = media.quality as string | undefined;
      let moreMedia: unknown = media;
      if (formatId === 'hls' || (formatId === 'mp4' && !quality)) {
        moreMedia = await this._download_json(formatUrl, videoId, undefined, { fatal: false });
      } else {
        moreMedia = [media];
      }
      const items = Array.isArray(moreMedia) ? moreMedia : [];
      for (const item of items) {
        formatUrl = url_or_none(item.videoUrl) || '';
        if (!formatUrl) continue;
        formatId = item.format as string | undefined;
        if (formatId === 'hls' || determine_ext(formatUrl) === 'm3u8') {
          formats.push(
            ...(await this._extract_m3u8_formats(
              formatUrl,
              videoId,
              'mp4',
              'm3u8_native',
              formatId || 'hls',
              undefined,
              undefined,
              undefined,
              false,
            )),
          );
          continue;
        }
        const q = item.quality as string | undefined;
        formats.push({
          url: formatUrl,
          ext: 'mp4',
          format_id: q || 'mp4',
          height: int_or_none(q) ?? undefined,
        });
      }
    }

    if (!formats.length) {
      const videoUrl = this._html_search_regex(/<source src="(.+?)" type="video\/mp4">/, webpage, 'video URL')!;
      formats.push({ url: videoUrl, ext: 'mp4', format_id: 'mp4' });
    }

    return merge_dicts(info, {
      id: videoId,
      ext: 'mp4',
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      upload_date:
        unified_strdate(
          this._search_regex(/<span[^>]+>(?:ADDED|Published on) ([^<]+)</, webpage, 'upload date', null, false) ||
            undefined,
        ) ?? undefined,
      duration:
        int_or_none(
          this._og_search_property('video:duration', webpage, undefined, false) ||
            this._search_regex(/videoDuration\s*:\s*(\d+)/, webpage, 'duration', null, false) ||
            undefined,
        ) ?? undefined,
      view_count:
        str_to_int(
          this._search_regex(
            [
              /<div[^>]*>Views<\/div>\s*<div[^>]*>\s*([\d,.]+)/,
              /<span[^>]*>VIEWS<\/span>\s*<\/td>\s*<td>\s*([\d,.]+)/,
              /<span[^>]+\bclass=["']video_view_count[^>]*>\s*([\d,.]+)/,
            ],
            webpage,
            'view count',
            null,
            false,
          )?.replace(/,/g, '') || undefined,
        ) ?? undefined,
      age_limit: 18,
      formats,
    }) as VideoInfo;
  }
}

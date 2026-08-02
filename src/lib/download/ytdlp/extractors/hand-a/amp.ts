/**
 * AMPIE — Akamai Adaptive Media Player feed base (yt-dlp amp.py)
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  mimetype2ext,
  str_or_none,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { parseIso8601, stripJsonp } from './helpers';

function protoRelativeUrl(url: string, scheme = 'http:'): string {
  if (url.startsWith('//')) return `${scheme}${url}`;
  return url;
}

export class AMPIE extends InfoExtractor {
  static IE_NAME = 'amp';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AMPIE is not a standalone extractor', { expected: true });
  }

  /** Parse Akamai AMP JSONP feed → VideoInfo fields */
  async _extract_feed_info(url: string): Promise<VideoInfo> {
    const text = await this._download_webpage(url, undefined, 'Downloading Akamai AMP feed', {
      fatal: true,
    });
    const feed = this._parse_json(stripJsonp(text), undefined, null, true) as Record<
      string,
      unknown
    >;
    const item = (feed.channel as Record<string, unknown> | undefined)?.item as
      | Record<string, unknown>
      | undefined;
    if (!item) {
      throw new ExtractorError(
        `${AMPIE.IE_NAME} said: ${String(feed.error || 'Unable to download Akamai AMP feed')}`,
        { expected: true },
      );
    }

    const videoId = String(item.guid || '');

    const getMediaNode = (name: string, defaultValue?: unknown): unknown => {
      const mediaName = `media-${name}`;
      const mediaGroup = (item['media-group'] as Record<string, unknown>) || item;
      return (
        mediaGroup[mediaName] ??
        item[mediaName] ??
        (defaultValue !== undefined ? defaultValue : item[name])
      );
    };

    const thumbnails: Thumbnail[] = [];
    let mediaThumbnail = getMediaNode('thumbnail');
    if (mediaThumbnail) {
      if (!Array.isArray(mediaThumbnail)) mediaThumbnail = [mediaThumbnail];
      for (const thumbnailData of mediaThumbnail as Record<string, unknown>[]) {
        const attrs = (thumbnailData['@attributes'] as Record<string, unknown>) || {};
        const thumbnailUrl = url_or_none(attrs.url);
        if (!thumbnailUrl) continue;
        thumbnails.push({
          url: protoRelativeUrl(thumbnailUrl, 'http:'),
          width: int_or_none(attrs.width),
          height: int_or_none(attrs.height),
        });
      }
    }

    const subtitles: Record<string, Subtitle[]> = {};
    let mediaSubtitle = getMediaNode('subTitle');
    if (mediaSubtitle) {
      if (!Array.isArray(mediaSubtitle)) mediaSubtitle = [mediaSubtitle];
      for (const subtitleData of mediaSubtitle as Record<string, unknown>[]) {
        const attrs = (subtitleData['@attributes'] as Record<string, unknown>) || {};
        const href = url_or_none(attrs.href);
        if (!href) continue;
        const lang = String(attrs.lang || 'en');
        (subtitles[lang] ||= []).push({
          url: href,
          ext: mimetype2ext(String(attrs.type || '')) || determine_ext(href),
        });
      }
    }

    let mediaContent = getMediaNode('content');
    if (mediaContent && !Array.isArray(mediaContent)) mediaContent = [mediaContent];

    const formats: Format[] = [];
    for (const mediaData of (mediaContent as Record<string, unknown>[]) || []) {
      const media = (mediaData['@attributes'] as Record<string, unknown>) || {};
      const mediaUrl = url_or_none(media.url);
      if (!mediaUrl) continue;
      const ext = mimetype2ext(String(media.type || '')) || determine_ext(mediaUrl);
      if (ext === 'f4m') {
        this.report_warning('Akamai f4m/HDS formats are not supported in Reader yet');
      } else if (ext === 'm3u8') {
        const { formats: hlsFormats, subtitles: hlsSubs } =
          await this._extractM3u8FormatsAndSubtitles(mediaUrl, videoId);
        formats.push(...hlsFormats);
        this._mergeSubtitles(hlsSubs, subtitles);
      } else {
        const catAttrs =
          (mediaData['media-category'] as Record<string, Record<string, unknown>> | undefined)?.[
            '@attributes'
          ];
        formats.push({
          format_id: String(catAttrs?.label || `direct-${formats.length}`),
          url: mediaUrl,
          tbr: int_or_none(media.bitrate),
          filesize: int_or_none(media.fileSize),
          ext,
        });
      }
    }

    const contentList = (mediaContent as Record<string, unknown>[]) || [];
    const firstAttrs = (contentList[0]?.['@attributes'] as Record<string, unknown>) || {};

    return {
      id: videoId,
      title: String(getMediaNode('title') || videoId),
      description: str_or_none(getMediaNode('description')) ?? undefined,
      thumbnails,
      thumbnail: thumbnails[0]?.url,
      timestamp:
        unified_timestamp(item.pubDate) ||
        parseIso8601(item['dc-date']) ||
        undefined,
      duration: int_or_none(firstAttrs.duration) ?? undefined,
      subtitles,
      formats,
    };
  }

  protected _mergeSubtitles(
    source: Record<string, Subtitle[]>,
    target: Record<string, Subtitle[]>,
  ): void {
    for (const [lang, subs] of Object.entries(source)) {
      (target[lang] ||= []).push(...subs);
    }
  }

  protected async _extractM3u8FormatsAndSubtitles(
    mediaUrl: string,
    videoId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const formats = await this._extract_m3u8_formats(
      mediaUrl,
      videoId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
      undefined,
      false,
    );
    return { formats, subtitles: {} };
  }
}

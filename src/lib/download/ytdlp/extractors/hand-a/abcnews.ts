/**
 * AbcNewsIE / AbcNewsVideoIE — aligned with yt-dlp abcnews.py + amp.py feed parser
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  mimetype2ext,
  parse_duration,
  str_or_none,
  unified_timestamp,
  url_or_none,
} from '../../utils';

function protoRelative(url: string, scheme = 'https:'): string {
  if (url.startsWith('//')) return `${scheme}${url}`;
  return url;
}

function stripJsonp(src: string): string {
  const m = src.match(/^[^(]*\(([\s\S]*)\)\s*;?\s*$/);
  return m ? m[1]! : src;
}

function parseIso8601(s: string): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.trunc(t / 1000) : null;
}

/** Minimal AMPIE._extract_feed_info from yt-dlp amp.py */
abstract class AMPIE extends InfoExtractor {
  async _extract_feed_info(feedUrl: string): Promise<VideoInfo> {
    const text = await this._httpGetText(feedUrl);
    const feed = this._parse_json(stripJsonp(text), undefined, null, false) as Record<
      string,
      unknown
    >;
    const item = (feed.channel as Record<string, unknown> | undefined)?.item as
      | Record<string, unknown>
      | undefined;
    if (!item) {
      throw new ExtractorError(
        `${(this.constructor as typeof InfoExtractor).IE_NAME} said: ${String(feed.error || 'feed error')}`,
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
          url: protoRelative(thumbnailUrl, 'http:'),
          width: int_or_none(attrs.width),
          height: int_or_none(attrs.height),
        });
      }
    }

    const subtitles: Record<string, Array<{ url: string; ext: string }>> = {};
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
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            mediaUrl,
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
      } else if (ext !== 'f4m') {
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
      description: str_or_none(getMediaNode('description')),
      thumbnails,
      thumbnail: thumbnails[0]?.url,
      timestamp:
        unified_timestamp(item.pubDate) || parseIso8601(String(item['dc-date'] || '')) || undefined,
      duration: int_or_none(firstAttrs.duration) ?? undefined,
      subtitles,
      formats,
    };
  }
}

export class AbcNewsVideoIE extends AMPIE {
  static IE_NAME = 'abcnews:video';
  static _VALID_URL =
    /https?:\/\/(?:abcnews\.go\.com\/(?:[^/]+\/)*video\/(?<display_id>[0-9a-z-]+)-|abcnews\.go\.com\/video\/(?:embed|itemfeed)\?.*?\bid=|fivethirtyeight\.abcnews\.go\.com\/video\/embed\/\d+\/)(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups?.display_id;
    const videoId = m.groups?.id || this._match_id(url);
    const info = await this._extract_feed_info(
      `http://abcnews.go.com/video/itemfeed?id=${videoId}`,
    );
    return {
      ...info,
      id: videoId,
      display_id: displayId || undefined,
      webpage_url: url,
      original_url: url,
      extractor: AbcNewsVideoIE.IE_NAME,
      extractor_key: 'AbcNewsVideo',
    };
  }
}

export class AbcNewsIE extends InfoExtractor {
  static IE_NAME = 'abcnews';
  static _VALID_URL =
    /https?:\/\/abcnews\.go\.com\/(?:[^/]+\/)+(?<display_id>[0-9a-z-]+)\/story\?id=(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const storyId = this._match_id(url);
    const webpage = await this._download_webpage(url, storyId);
    const dataMatch = webpage.match(/window\['__abcnews__'\]\s*=\s*({.+?});/s);
    if (!dataMatch) throw new ExtractorError('Unable to extract abcnews data', { expected: true });

    const data = JSON.parse(dataMatch[1]!) as Record<string, unknown>;
    const page = data.page as Record<string, unknown>;
    const content = page.content as Record<string, unknown>;
    const storyRoot = content.story as Record<string, unknown>;
    const everscroll = (storyRoot.everscroll as Record<string, unknown>[]) || [];
    const storyBlock = everscroll[0];
    if (!storyBlock) throw new ExtractorError('Unable to extract abcnews story', { expected: true });
    const articleContents = (storyBlock.articleContents as Record<string, unknown>) || {};

    const entries: VideoInfo[] = [];

    const featuredVideo = (storyBlock.featuredVideo as Record<string, unknown>) || {};
    const feedVideo = featuredVideo.video as Record<string, unknown> | undefined;
    const feed = feedVideo?.feed as string | undefined;
    if (feed) {
      entries.push({
        _type: 'url',
        id: String(featuredVideo.id || storyId),
        title: String(featuredVideo.name || storyId),
        url: feed,
        thumbnail: str_or_none(featuredVideo.images) || undefined,
        description: str_or_none(featuredVideo.description),
        timestamp: parseIso8601(String(featuredVideo.uploadDate || '')) ?? undefined,
        duration: parse_duration(featuredVideo.duration) ?? undefined,
        extractor: 'AbcNewsVideo',
        extractor_key: 'AbcNewsVideo',
      });
    }

    for (const inline of (articleContents.inlines as Record<string, unknown>[]) || []) {
      const inlineType = inline.type;
      if (inlineType === 'iframe') {
        const attrs = inline.attrs as Record<string, unknown> | undefined;
        const iframeUrl = str_or_none(attrs?.src);
        if (iframeUrl) entries.push(this.url_result(iframeUrl));
      } else if (inlineType === 'video') {
        const videoId = inline.id;
        if (videoId) {
          entries.push({
            _type: 'url',
            id: String(videoId),
            url: `http://abcnews.go.com/video/embed?id=${videoId}`,
            thumbnail: str_or_none(inline.imgSrc || inline.imgDefault) || undefined,
            description: str_or_none(inline.description),
            duration: parse_duration(inline.duration) ?? undefined,
            extractor: 'AbcNewsVideo',
            extractor_key: 'AbcNewsVideo',
          });
        }
      }
    }

    return this.playlist_result(
      entries,
      storyId,
      str_or_none(articleContents.headline),
      str_or_none(articleContents.subHead),
    );
  }
}

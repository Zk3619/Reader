/**
 * IGN family — ported from yt-dlp ign.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  extract_attributes,
  int_or_none,
  merge_dicts,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601, searchNextjsData, stripOrNone, urljoin } from './_helpers';

export class IGNBaseIE extends InfoExtractor {
  static IE_NAME = 'ignbase';
  static _VALID_URL: RegExp | string | false | null = false;
  protected _PAGE_TYPE = 'video';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('IGNBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(slug: string): Promise<Record<string, unknown>> {
    return this._download_json<Record<string, unknown>>(
      `http://apis.ign.com/${this._PAGE_TYPE}/v3/${this._PAGE_TYPE}s/slug/${slug}`,
      slug,
    );
  }

  protected async _checkedCallApi(slug: string): Promise<Record<string, unknown> | null> {
    try {
      return await this._callApi(slug);
    } catch (e) {
      const msg = (e as Error).message || '';
      if (/404/.test(msg)) {
        throw new ExtractorError('Content not found: expired?', { expected: true, cause: e });
      }
      throw e;
    }
  }

  protected async _extractVideoInfo(video: Record<string, unknown>, fatal = true): Promise<VideoInfo | null> {
    const videoId = String(video.videoId ?? '');
    if (!videoId) {
      if (fatal) throw new ExtractorError('Missing videoId', { expected: true });
      return null;
    }

    const formats: Format[] = [];
    const refs = (video.refs as Record<string, unknown>) || {};

    const m3u8Url = url_or_none(refs.m3uUrl);
    if (m3u8Url) {
      const res = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');
      formats.push(...res.formats);
    }

    for (const asset of (video.assets as Array<Record<string, unknown>>) || []) {
      const assetUrl = url_or_none(asset.url);
      if (!assetUrl) continue;
      formats.push({
        format_id: str_or_none(asset.bitrate) ?? `http-${formats.length}`,
        url: assetUrl,
        tbr: int_or_none(asset.bitrate, 1000) ?? undefined,
        fps: int_or_none(asset.frame_rate) ?? undefined,
        height: int_or_none(asset.height) ?? undefined,
        width: int_or_none(asset.width) ?? undefined,
      });
    }

    const mezzanineUrl = url_or_none(traverse_obj(video, ['system', 'mezzanineUrl']));
    if (mezzanineUrl) {
      formats.push({
        ext: determine_ext(mezzanineUrl, 'mp4') || 'mp4',
        format_id: 'mezzanine',
        quality: 1,
        url: mezzanineUrl,
      });
    }

    const thumbnails = ((video.thumbnails as Array<Record<string, unknown>>) || [])
      .map((t) => url_or_none(t.url))
      .filter(Boolean)
      .map((u) => ({ url: u! }));

    const tags = ((video.tags as Array<Record<string, unknown>>) || [])
      .map((t) => stripOrNone(t.displayName))
      .filter(Boolean) as string[];

    const metadata = (video.metadata as Record<string, unknown>) || {};
    const title =
      stripOrNone(metadata.longTitle) ||
      stripOrNone(metadata.title) ||
      stripOrNone(metadata.name) ||
      undefined;

    return {
      id: videoId,
      title,
      description: stripOrNone(metadata.description) ?? undefined,
      timestamp: parseIso8601(metadata.publishDate) ?? undefined,
      duration: int_or_none(metadata.duration) ?? undefined,
      thumbnails,
      formats,
      tags,
    };
  }
}

export class IGNIE extends IGNBaseIE {
  static IE_NAME = 'ign.com';
  static _VALID_URL =
    /https?:\/\/(?:.+?\.ign|www\.pcmag)\.com\/videos(?:(?:\/(?:\d{4}\/\d{2}\/\d{2}\/)?(?<id>.+?)(?:[/?&#]|$))|(?:\/?\?(?<filt>[^&#]+))?)/;
  protected _PAGE_TYPE = 'video';

  static extractEmbedUrls(url: string, webpage: string): string[] {
    const grids = [
      ...webpage.matchAll(
        /<section\b[^>]+\bclass\s*=\s*['"](?:[\w-]+\s+)*?content-feed-grid(?!\B|-)[^>]+>([\s\S]*?)<\/section[^>]*>/gi,
      ),
    ].map((m) => m[1] || '');
    const grid = grids[0] || '';
    const videoPathRe =
      /<a\b[^>]+\bhref\s*=\s*('|")(?<path>\/videos\/(?:\d{4}\/\d{2}\/\d{2}\/)?(?<id>.+?)(?:[/?&#]|$))\1/gi;
    return [...grid.matchAll(videoPathRe)]
      .map((m) => urljoin(url, m.groups!.path!))
      .filter(Boolean);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.id;
    const filt = m.groups!.filt;
    if (displayId) return this._extractVideo(url, displayId);
    return this._extractPlaylist(url, filt || 'all');
  }

  protected async _extractPlaylist(url: string, displayId: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, displayId);
    const entries = IGNIE.extractEmbedUrls(url, webpage).map((u) => this.url_result(u, 'IGN'));
    return this.playlist_result(entries, displayId);
  }

  protected async _extractVideo(_url: string, displayId: string): Promise<VideoInfo> {
    const video = await this._checkedCallApi(displayId);
    const info = await this._extractVideoInfo(video || {});
    return merge_dicts({ display_id: displayId }, info || {}) as VideoInfo;
  }
}

export class IGNVideoIE extends IGNBaseIE {
  static IE_NAME = 'ign:video';
  static _VALID_URL = /https?:\/\/.+?\.ign\.com\/(?:[a-z]{2}\/)?[^/]+\/(?<id>\d+)\/(?:video|trailer)\//;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const embedUrl = url.replace(/\/[^/]+\/?$/, '/embed');

    const res = await this._request_webpage(embedUrl, videoId);
    const newUrl = res?.url || embedUrl;
    const webpage = res?.text || '';

    const ignUrlMatch = /[?&]url=([^&#]+)/.exec(new URL(newUrl, url).search);
    const ignUrl = ignUrlMatch ? decodeURIComponent(ignUrlMatch[1]!) : null;
    if (ignUrl) return this.url_result(ignUrl, 'IGN');

    const videoEl = this._search_regex(
      /(<div\b[^>]+\bdata-video-id\s*=\s*[^>]+>)/,
      webpage,
      'video element',
      null,
      false,
    );
    if (!videoEl) {
      if (newUrl === embedUrl) throw new ExtractorError(`Redirect loop: ${url}`, { expected: true });
      return this.url_result(newUrl);
    }

    const videoAttrs = extract_attributes(videoEl);
    const videoDataRaw = videoAttrs['data-settings'] || '{}';
    const videoData = (this._parse_json<{ video?: Record<string, unknown> }>(videoDataRaw, videoId) || {}).video || {};
    const info = await this._extractVideoInfo(videoData);
    return merge_dicts({ display_id: videoId }, info || {}) as VideoInfo;
  }
}

export class IGNArticleIE extends IGNBaseIE {
  static IE_NAME = 'ign:article';
  static _VALID_URL =
    /https?:\/\/.+?\.ign\.com\/(?:articles(?:\/\d{4}\/\d{2}\/\d{2})?|(?:[a-z]{2}\/)?(?:[\w-]+\/)*?feature\/\d+)\/(?<id>[^/?&#]+)/;
  protected _PAGE_TYPE = 'article';

  protected async _checkedCallApi(slug: string): Promise<Record<string, unknown> | null> {
    try {
      return await this._callApi(slug);
    } catch (e) {
      const msg = (e as Error).message || '';
      if (/404/.test(msg)) {
        throw new ExtractorError('Content not found: expired?', { expected: true, cause: e });
      }
      if (/503/.test(msg)) {
        this.report_warning(msg);
        return null;
      }
      throw e;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const article = await this._checkedCallApi(displayId);

    let entries: VideoInfo[] = [];
    let playlistId: string | null = null;

    if (article) {
      const mediaUrl = url_or_none(
        traverse_obj(article, ['mediaRelations', 0, 'media', 'metadata', 'url']),
      );
      if (mediaUrl) entries.push(this.url_result(mediaUrl, 'IGN'));
      for (const content of (article.content as string[]) || []) {
        for (const m of content.matchAll(/(?:\[(?:ignvideo\s+url|youtube\s+clip_id)|<iframe[^>]+src)="([^"]+)"/g)) {
          const videoUrl = url_or_none(m[1]);
          if (videoUrl) entries.push(this.url_result(videoUrl));
        }
      }
      playlistId = article.articleId != null ? String(article.articleId) : null;
    } else {
      const webpage = await this._download_webpage(url, displayId);
      playlistId = this._html_search_meta('dable:item_id', webpage, undefined, false);

      if (playlistId) {
        for (const m of webpage.matchAll(
          /<object\b[^>]+\bclass\s*=\s*("|')ign-videoplayer\1[^>]*>([\s\S]*?)<\/object/gi,
        )) {
          const params = m[2] || '';
          const flashvarsMatch = params.match(/<param\b[^>]+\bname\s*=\s*("|')flashvars\1[^>]*>/i);
          if (!flashvarsMatch) continue;
          const flashvars = extract_attributes(flashvarsMatch[0]!);
          const value = flashvars.value || '';
          const parsed = Object.fromEntries(new URLSearchParams(value.replace(/&amp;/g, '&')));
          const vUrl = url_or_none(parsed.url);
          if (vUrl) entries.push(this.url_result(vUrl));
        }
      } else {
        playlistId =
          this._search_regex(/\bdata-post-id\s*=\s*("|')(?<id>[\da-f]+)\1/, webpage, 'id', null, false, 'id') ||
          null;
        const nextjsData = searchNextjsData(this, webpage, displayId);
        const apolloState = (nextjsData.apolloState as Record<string, unknown>) || {};
        const rootQuery = (apolloState.ROOT_QUERY as Record<string, unknown>) || {};

        for (const [key, value] of Object.entries(rootQuery)) {
          if (!key.startsWith('videoPlayerProps(')) continue;
          const playerRef = typeof value === 'object' && value && '__ref' in (value as object)
            ? String((value as Record<string, unknown>).__ref)
            : null;
          if (!playerRef) continue;
          const modernKey = playerRef.replace('PlayerProps', 'ModernContent');
          if (apolloState[modernKey]) continue;
          const video = (apolloState[playerRef] as Record<string, unknown>) || {};
          const info = await this._extractVideoInfo(video, false);
          if (info) entries.push(merge_dicts({ display_id: displayId }, info) as VideoInfo);
        }
      }

      const pageTitle = this._og_search_title(webpage, false)?.replace(/\s+-\s+IGN\s*$/, '') || undefined;
      return this.playlist_result(entries, playlistId || displayId, pageTitle);
    }

    return this.playlist_result(
      entries,
      playlistId || displayId,
      stripOrNone(traverse_obj(article, ['metadata', 'headline'])) ?? undefined,
    );
  }
}

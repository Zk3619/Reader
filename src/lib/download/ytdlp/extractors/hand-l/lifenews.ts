/**
 * LifeNewsIE / LifeEmbedIE — ported from yt-dlp lifenews.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { determine_ext, int_or_none, remove_end } from '../../utils';
import { parse_iso8601, protoRelative, urljoin } from './_helpers';

export class LifeNewsIE extends InfoExtractor {
  static IE_NAME = 'life';
  static IE_DESC = 'Life.ru';
  static _VALID_URL = /https?:\/\/life\.ru\/t\/[^/]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const videoUrls = [...webpage.matchAll(/<video[^>]+><source[^>]+src=["'](.+?)["']/g)].map((m) => m[1]!);
    const iframeLinks = [
      ...webpage.matchAll(/<iframe[^>]+src=["']((?:https?:)?\/\/embed\.life\.ru\/(?:embed|video)\/.+?)["']/g),
    ].map((m) => m[1]!);

    if (!videoUrls.length && !iframeLinks.length) {
      throw new ExtractorError(`No media links available for ${videoId}`);
    }

    const title = remove_end(this._og_search_title(webpage) || '', ' - Life.ru') || videoId;
    const description = this._og_search_description(webpage) || undefined;
    const viewCount = this._html_search_regex(
      /<div[^>]+class=(["']).*?\bhits-count\b.*?\1[^>]*>\s*(?<value>\d+)\s*<\/div>/,
      webpage,
      'view count',
      null,
      false,
      'value',
    );
    const timestamp = parse_iso8601(
      this._search_regex(/<time[^>]+datetime=(["'])(?<value>.+?)\1/, webpage, 'upload date', null, false, 'value'),
    );

    const commonInfo = {
      description,
      view_count: int_or_none(viewCount) ?? undefined,
      timestamp: timestamp ?? undefined,
    };

    const makeEntry = (id: string, mediaUrl: string, index?: number): VideoInfo => ({
      ...commonInfo,
      id: index ? `${id}-video${index}` : id,
      formats: [{ format_id: 'http', url: mediaUrl }],
      title: index ? `${title} (Видео ${index})` : title,
    });

    const makeVideoEntry = (id: string, mediaUrl: string, index?: number) =>
      makeEntry(id, urljoin(url, mediaUrl), index);

    const makeIframeEntry = (id: string, mediaUrl: string, index?: number): VideoInfo => ({
      ...makeEntry(id, protoRelative(mediaUrl), index),
      _type: 'url_transparent',
    });

    if (videoUrls.length === 1 && !iframeLinks.length) {
      return makeVideoEntry(videoId, videoUrls[0]!);
    }
    if (iframeLinks.length === 1 && !videoUrls.length) {
      return makeIframeEntry(videoId, iframeLinks[0]!);
    }

    const entries: VideoInfo[] = [];
    videoUrls.forEach((u, i) => entries.push(makeVideoEntry(videoId, u, i + 1)));
    iframeLinks.forEach((u, i) => entries.push(makeIframeEntry(videoId, u, videoUrls.length + i + 1)));

    return this.playlist_result(entries, videoId, title, description);
  }
}

export class LifeEmbedIE extends InfoExtractor {
  static IE_NAME = 'life:embed';
  static _VALID_URL = /https?:\/\/embed\.life\.ru\/(?:embed|video)\/(?<id>[\da-f]{32})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const formats: VideoInfo['formats'] = [];
    let thumbnail: string | undefined;

    const extractM3u8 = async (manifestUrl: string) => {
      formats!.push(
        ...(await this._extract_m3u8_formats(urljoin(url, manifestUrl), videoId, 'mp4', 'm3u8_native', undefined, undefined, 'm3u8')),
      );
    };

    const extractOriginal = (originalUrl: string) => {
      formats!.push({
        url: originalUrl,
        format_id: determine_ext(originalUrl) || 'original',
        quality: 1,
      });
    };

    const optionsRaw = this._search_regex(/options\s*=\s*({.+?});/, webpage, 'options', null, false) || '{}';
    const options = this._parse_json<{ playlist?: Record<string, unknown> }>(optionsRaw, videoId);
    const playlist = options?.playlist || {};

    if (Object.keys(playlist).length) {
      const master = playlist.master;
      if (typeof master === 'string' && determine_ext(master) === 'm3u8') {
        await extractM3u8(master);
      }
      if (typeof playlist.original === 'string') {
        extractOriginal(String(playlist.original));
      }
      if (playlist.image) thumbnail = String(playlist.image);
    }

    if (!formats?.length) {
      for (const m of webpage.matchAll(/"file"\s*:\s*"([^"]+)"/g)) {
        const videoUrl = urljoin(url, m[1]!);
        if (determine_ext(videoUrl) === 'm3u8') await extractM3u8(videoUrl);
        else extractOriginal(videoUrl);
      }
    }

    thumbnail =
      thumbnail ||
      this._search_regex(/"image"\s*:\s*"([^"]+)"/, webpage, 'thumbnail', null, false) ||
      undefined;

    return {
      id: videoId,
      title: videoId,
      thumbnail: thumbnail || undefined,
      formats: formats || [],
    };
  }
}

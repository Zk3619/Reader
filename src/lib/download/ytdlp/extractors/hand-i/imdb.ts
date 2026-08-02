/**
 * ImdbIE / ImdbListIE — ported from yt-dlp imdb.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  mimetype2ext,
  traverse_obj,
  try_get,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, searchNextjsData } from './_helpers';

function videoQuality(formatId: string): number {
  const order = ['SD', '480p', '720p', '1080p'];
  const idx = order.indexOf(formatId);
  return idx >= 0 ? idx : -1;
}

export class ImdbIE extends InfoExtractor {
  static IE_NAME = 'imdb';
  static IE_DESC = 'Internet Movie Database trailers';
  static _VALID_URL = /https?:\/\/(?:www|m)\.imdb\.com\/(?:video|title|list).*?[/-]vi(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`https://www.imdb.com/video/vi${videoId}`, videoId);

    const nextData = searchNextjsData(this, webpage, videoId);
    const pageProps = (nextData.pageProps as Record<string, unknown>) || {};
    const videoInfo =
      ((pageProps.videoPlaybackData as Record<string, unknown>)?.video as Record<string, unknown>) || {};

    let title =
      (traverse_obj(videoInfo, ['name', 'value']) as string | undefined) ||
      (traverse_obj(videoInfo, ['primaryTitle', 'titleText', 'text']) as string | undefined) ||
      this._html_search_meta(['og:title', 'twitter:title'], webpage, undefined, false) ||
      this._html_search_regex(/<title[^>]*>([^<]+)<\/title>/i, webpage, 'title', null, false);

    let data = (videoInfo.playbackURLs as unknown[]) || [];
    if (!data.length) {
      const keyPayload = {
        type: 'VIDEO_PLAYER',
        subType: 'FORCE_LEGACY',
        id: `vi${videoId}`,
      };
      const key = btoa(JSON.stringify(keyPayload));
      const legacy = await this._download_json<Array<{ videoLegacyEncodings?: unknown[] }>>(
        'https://www.imdb.com/ve/data/VIDEO_PLAYBACK_DATA',
        videoId,
        undefined,
        { query: { key } },
      );
      data = legacy[0]?.videoLegacyEncodings || [];
    }

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    for (const encoding of data) {
      if (!encoding || typeof encoding !== 'object') continue;
      const enc = encoding as Record<string, unknown>;
      const videoUrl = url_or_none(enc.url);
      if (!videoUrl) continue;
      const ext = mimetype2ext(enc.mimeType as string | undefined) || determine_ext(videoUrl);
      if (ext === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, videoUrl, videoId, 'hls');
        subtitles = mergeSubtitles(subtitles, res.subtitles);
        formats.push(...res.formats);
        continue;
      }
      const formatId =
        (traverse_obj(enc, ['displayName', 'value']) as string | undefined) ||
        (enc.definition as string | undefined) ||
        'http';
      formats.push({
        format_id: formatId,
        url: videoUrl,
        ext: ext || undefined,
        quality: videoQuality(formatId),
      });
    }

    return {
      id: videoId,
      title: title || videoId,
      alt_title: pageProps.videoSubTitle as string | undefined,
      formats,
      description: try_get(videoInfo, (x: Record<string, unknown>) => (x.description as Record<string, unknown>)?.value) as
        | string
        | undefined,
      thumbnail: url_or_none(try_get(videoInfo, (x: Record<string, unknown>) => (x.thumbnail as Record<string, unknown>)?.url)) ?? undefined,
      duration: int_or_none(try_get(videoInfo, (x: Record<string, unknown>) => (x.runtime as Record<string, unknown>)?.value)) ?? undefined,
      subtitles,
    };
  }
}

export class ImdbListIE extends InfoExtractor {
  static IE_NAME = 'imdb:list';
  static IE_DESC = 'Internet Movie Database lists';
  static _VALID_URL = /https?:\/\/(?:www\.)?imdb\.com\/list\/ls(?<id>\d{9})(?!\/videoplayer\/vi\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const listId = this._match_id(url);
    const webpage = await this._download_webpage(url, listId);

    const hrefRe = new RegExp(`href="(/list/ls${listId}/videoplayer/vi[^"]+)"`, 'g');
    const entries = [...webpage.matchAll(hrefRe)].map((m) =>
      this.url_result(`http://www.imdb.com${m[1]}`, 'Imdb'),
    );

    const listTitle = this._html_search_regex(
      /<h1[^>]+class="[^"]*header[^"]*"[^>]*>(.*?)<\/h1>/,
      webpage,
      'list title',
    )!;
    const listDescription = this._html_search_regex(
      /<div[^>]+class="[^"]*list-description[^"]*"[^>]*><p>(.*?)<\/p>/,
      webpage,
      'list description',
    )!;

    return this.playlist_result(entries, listId, listTitle, listDescription);
  }
}

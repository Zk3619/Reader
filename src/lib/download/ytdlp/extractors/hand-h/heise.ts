/**
 * HeiseIE — ported from yt-dlp heise.py
 */

import { InfoExtractor, NO_DEFAULT } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, parse_qs, smuggle_url } from '../../utils';
import { extractKalturaEmbedUrls } from '../kaltura';
import { playlistFromMatches } from '../hand-a/helpers';
import { extractYoutubeEmbedUrl, parseIso8601 } from './_helpers';

export class HeiseIE extends InfoExtractor {
  static IE_NAME = 'heise';
  static _VALID_URL = /https?:\/\/(?:www\.)?heise\.de\/(?:[^/]+\/)+[^/]+-(?<id>[0-9]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const extractTitle = (defaultVal?: unknown): string | null => {
      let title = this._html_search_meta(['fulltitle', 'title'], webpage, undefined, false);
      if (!title || title === "c't") {
        title = this._search_regex(
          /<div[^>]+class="videoplayerjw"[^>]+data-title="([^"]+)"/,
          webpage,
          'title',
          null,
          false,
        );
      }
      if (!title) {
        title = this._html_search_regex(
          /<h1[^>]+\bclass=["']article_page_title[^>]+>(.+?)</,
          webpage,
          'title',
          defaultVal === NO_DEFAULT ? NO_DEFAULT : null,
          defaultVal === NO_DEFAULT,
        );
      }
      return title;
    };

    let title = extractTitle(undefined);
    const description =
      this._og_search_description(webpage) ||
      this._html_search_meta('description', webpage, undefined, false) ||
      undefined;

    const makeKalturaResult = (kalturaUrl: string): VideoInfo => ({
      _type: 'url_transparent',
      id: videoId,
      url: smuggle_url(kalturaUrl, { source_url: url }),
      extractor: 'Kaltura',
      extractor_key: 'Kaltura',
      title: title ?? videoId,
      description,
    });

    const kalturaUrls = extractKalturaEmbedUrls(webpage);
    if (kalturaUrls[0]) return makeKalturaResult(kalturaUrls[0]!);

    const kalturaId = this._search_regex(
      /entry-id=(["'])(?<id>(?:(?!\1).)+)\1/,
      webpage,
      'kaltura id',
      null,
      false,
      'id',
    );
    if (kalturaId) return makeKalturaResult(`kaltura:2238431:${kalturaId}`);

    const ytUrl = extractYoutubeEmbedUrl(webpage);
    if (ytUrl) {
      return playlistFromMatches(this, [ytUrl], videoId, { title, ie: 'Youtube' });
    }

    title = extractTitle(NO_DEFAULT) || videoId;

    let apiParams: Record<string, string> = {};
    const feedParams = this._search_regex(/\/videout\/feed\.json\?([^']+)/, webpage, 'feed params', null, false);
    if (feedParams) {
      const parsed = parse_qs(feedParams);
      for (const [k, v] of Object.entries(parsed)) {
        if (v[0]) apiParams[k] = v[0]!;
      }
    }
    if (!apiParams.container || !apiParams.sequenz) {
      apiParams = {
        container: this._search_regex(
          /<div class="videoplayerjw"[^>]+data-container="([0-9]+)"/,
          webpage,
          'container ID',
          null,
          false,
        ) ?? '',
        sequenz: this._search_regex(
          /<div class="videoplayerjw"[^>]+data-sequenz="([0-9]+)"/,
          webpage,
          'sequenz ID',
          null,
          false,
        ) ?? '',
      };
    }

    const query = new URLSearchParams(apiParams).toString();
    const doc = await this._download_webpage(
      `http://www.heise.de/videout/feed?${query}`,
      videoId,
    );

    const formats: Format[] = [];
    for (const sourceMatch of doc.matchAll(/<jwplayer:source\b([^>]*)\/>/gi)) {
      const attrs = sourceMatch[1] || '';
      const label = attrs.match(/\blabel="([^"]+)"/)?.[1];
      const file = attrs.match(/\bfile="([^"]+)"/)?.[1];
      if (!label || !file) continue;
      const heightMatch = label.match(/^(.*?_)?([0-9]+)p$/);
      const height = heightMatch ? int_or_none(heightMatch[2]) : null;
      const ext = determine_ext(file, '');
      formats.push({
        url: file,
        format_note: label,
        format_id: `${ext}_${label}`,
        height: height ?? undefined,
      });
    }
    for (const sourceMatch of doc.matchAll(/<source\b([^>]*)\/>/gi)) {
      const attrs = sourceMatch[1] || '';
      const label = attrs.match(/\blabel="([^"]+)"/)?.[1];
      const file = attrs.match(/\bfile="([^"]+)"/)?.[1];
      if (!label || !file) continue;
      const heightMatch = label.match(/^(.*?_)?([0-9]+)p$/);
      const height = heightMatch ? int_or_none(heightMatch[2]) : null;
      const ext = determine_ext(file, '');
      formats.push({
        url: file,
        format_note: label,
        format_id: `${ext}_${label}`,
        height: height ?? undefined,
      });
    }

    const thumb =
      doc.match(/<media:thumbnail[^>]+url="([^"]+)"/i)?.[1] ||
      this._og_search_thumbnail(webpage) ||
      undefined;

    return {
      id: videoId,
      title,
      description,
      thumbnail: thumb,
      timestamp: parseIso8601(this._html_search_meta('date', webpage, undefined, false) || undefined) ?? undefined,
      formats,
    };
  }
}

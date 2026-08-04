// @ts-nocheck
/** WordpressPlaylistEmbedIE / WordpressMiniAudioPlayerEmbedIE â€?ported from yt-dlp wordpress.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  extract_attributes,
  get_elements_by_class,
  int_or_none,
  parse_duration,
  traverse_obj,
} from '../../utils';
import { genericId, genericTitle } from './_helpers';

function getElementsTextAndHtmlByHref(
  hrefPattern: RegExp,
  webpage: string,
): Array<{ title: string; html: string }> {
  const out: Array<{ title: string; html: string }> = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const m of webpage.matchAll(re)) {
    const attrs = extract_attributes(m[1] || '');
    const href = attrs.href || '';
    if (!hrefPattern.test(href)) continue;
    const inner = (m[2] || '').replace(/<[^>]+>/g, '').trim();
    out.push({ title: inner, html: m[0]! });
  }
  return out;
}

export class WordpressPlaylistEmbedIE extends InfoExtractor {
  static IE_NAME = 'wordpress:playlist';
  static _VALID_URL = false as const;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('WordpressPlaylistEmbedIE extracts from webpages only', {
      expected: true,
    });
  }

  async _extractFromWebpage(url: string, webpage: string): Promise<VideoInfo[]> {
    const results: VideoInfo[] = [];
    const blocks = get_elements_by_class('wp-playlist-script', webpage);
    for (let i = 0; i < blocks.length; i++) {
      const playlistJson =
        this._parse_json<Record<string, unknown>>(blocks[i]!, genericId(url), null, false) ||
        {};
      if (!playlistJson || !Object.keys(playlistJson).length) continue;

      const tracks = (playlistJson.tracks as Array<Record<string, unknown>>) || [];
      const entries: VideoInfo[] = tracks
        .filter((t) => t && typeof t === 'object')
        .map((track) => ({
          id: genericId(String(track.src || '')),
          title: track.title != null ? String(track.title) : undefined,
          url: track.src != null ? String(track.src) : undefined,
          thumbnail: traverse_obj(track, ['thumb', 'src']) as string | undefined,
          album: traverse_obj(track, ['meta', 'album']) as string | undefined,
          artist: traverse_obj(track, ['meta', 'artist']) as string | undefined,
          genre: traverse_obj(track, ['meta', 'genre']) as string | undefined,
          duration:
            parse_duration(traverse_obj(track, ['meta', 'length_formatted'])) ?? undefined,
          description: track.description != null ? String(track.description) : undefined,
          height:
            int_or_none(traverse_obj(track, ['dimensions', 'original', 'height'])) ?? undefined,
          width:
            int_or_none(traverse_obj(track, ['dimensions', 'original', 'width'])) ?? undefined,
        }));

      results.push(
        this.playlist_result(
          entries,
          `${genericId(url)}-wp-playlist-${i + 1}`,
          'Wordpress Playlist',
        ),
      );
    }
    return results;
  }
}

export class WordpressMiniAudioPlayerEmbedIE extends InfoExtractor {
  static IE_NAME = 'wordpress:mb.miniAudioPlayer';
  static _VALID_URL = false as const;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError(
      'WordpressMiniAudioPlayerEmbedIE extracts from webpages only',
      { expected: true },
    );
  }

  async _extractFromWebpage(url: string, webpage: string): Promise<VideoInfo[]> {
    const mbPlayerParams = this._search_regex(
      /function\s*initializeMiniAudioPlayer\(\)\{[^}]+jQuery([^;]+)\.mb_miniPlayer/,
      webpage,
      'mb player params',
      null,
      false,
    );
    if (!mbPlayerParams) return [];

    const fileExts = [...mbPlayerParams.matchAll(/a\[href\s*\*=\s*'\.([a-zA-Z\d]+)'/g)].map(
      (m) => m[1]!,
    );
    if (!fileExts.length) return [];

    const hrefRe = new RegExp(`(?:[^"']+\\.(?:${fileExts.join('|')}))`, 'i');
    const candidates = getElementsTextAndHtmlByHref(hrefRe, webpage);
    const excludeClasses = [
      ...mbPlayerParams.matchAll(/\.not\("\.([^"]+)/g),
    ].map((m) => m[1]!);

    const results: VideoInfo[] = [];
    for (const { title, html } of candidates) {
      const attrs = extract_attributes(html);
      const cls = attrs.class || '';
      if (excludeClasses.some((c) => cls.includes(c))) continue;
      const href = attrs.href;
      if (!href) continue;
      results.push({
        id: genericId(href),
        title: title || genericTitle(this, href) || genericId(href),
        url: href,
      });
    }
    void url;
    return results;
  }
}

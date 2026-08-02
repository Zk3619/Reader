/**
 * Kenh14VideoIE / Kenh14PlaylistIE — ported from yt-dlp kenh14.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  extract_attributes,
  get_element_by_class,
  int_or_none,
  parse_duration,
  remove_start,
  traverse_obj,
  unescapeHTML,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, extractMpdFormatsAndSubtitles, mergeSubtitles, parseIso8601, stripOrNone } from './_helpers';

function getElementHtmlByAttribute(attr: string, value: string, html: string): string | null {
  const re = new RegExp(`<([a-zA-Z0-9]+)([^>]*\\s${attr}=["']${value}["'][^>]*)>`, 'i');
  const m = html.match(re);
  return m ? `<${m[1]}${m[2]}>` : null;
}

function getElementsHtmlByClass(cls: string, html: string): string[] {
  const re = new RegExp(`<([a-zA-Z0-9]+)([^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(`<${m[1]}${m[2]}>`);
  return out;
}

function* yieldJsonLd(html: string): Generator<Record<string, unknown>> {
  const blocks =
    html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of blocks) {
    const m = block.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!m?.[1]) continue;
    try {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed)) yield* parsed;
      else if (parsed && typeof parsed === 'object') yield parsed as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
}

export class Kenh14VideoIE extends InfoExtractor {
  static IE_NAME = 'kenh14';
  static _VALID_URL =
    /https?:\/\/video\.kenh14\.vn\/(?:video\/)?[\w-]+-(?<id>[0-9]+)\.chn/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const attrs = extract_attributes(getElementHtmlByAttribute('type', 'VideoStream', webpage) || '');
    const directUrl = attrs['data-vid'];

    const metadata = await this._download_json<Record<string, unknown>>(
      `https://api.kinghub.vn/video/api/v1/detailVideoByGet?FileName=${remove_start(directUrl, 'kenh14cdn.com/')}`,
      videoId,
      undefined,
      { fatal: false },
    );

    const formats: Format[] = [{ url: `https://${directUrl}`, format_id: 'http', quality: 1 }];
    let subtitles: Record<string, Subtitle[]> = {};

    const videoData = await this._download_json<Record<string, unknown>>(
      `https://${directUrl}.json`,
      videoId,
      'Downloading video data',
      { fatal: false },
    );

    const hlsUrl = url_or_none(traverse_obj(videoData, ['hls']));
    if (hlsUrl) {
      const res = await extractM3u8FormatsAndSubtitles(this, hlsUrl, videoId, 'hls');
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }

    const dashUrl = url_or_none(traverse_obj(videoData, ['mpd']));
    if (dashUrl) {
      const res = await extractMpdFormatsAndSubtitles(this, dashUrl, videoId, 'dash');
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }

    const keywords = this._html_search_meta('keywords', webpage, undefined, false);
    const tags = keywords
      ? keywords.split(';').map((t) => t.trim()).filter(Boolean)
      : undefined;

    return {
      duration: parse_duration(metadata.duration) ?? undefined,
      uploader: stripOrNone(metadata.author) ?? undefined,
      timestamp: parseIso8601(String(metadata.uploadtime ?? '').replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T')) ?? undefined,
      view_count: int_or_none(metadata.views) ?? undefined,
      id: videoId,
      title:
        stripOrNone(metadata.title) ||
        clean_html(this._og_search_title(webpage) || '') ||
        clean_html(get_element_by_class('vdbw-title', webpage) || '') ||
        undefined,
      formats,
      subtitles,
      description:
        clean_html(this._og_search_description(webpage) || '') ||
        clean_html(get_element_by_class('vdbw-sapo', webpage) || '') ||
        undefined,
      thumbnail: this._og_search_thumbnail(webpage) || attrs['data-thumb'] || undefined,
      tags,
    };
  }
}

export class Kenh14PlaylistIE extends InfoExtractor {
  static IE_NAME = 'kenh14:playlist';
  static _VALID_URL =
    /https?:\/\/video\.kenh14\.vn\/playlist\/[\w-]+-(?<id>[0-9]+)\.chn/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);

    const categoryDetail = get_element_by_class('category-detail', webpage) || '';
    let embedInfo: Record<string, unknown> = {};
    for (const item of yieldJsonLd(webpage)) {
      if (item.name && item.alternateName) {
        embedInfo = item;
        break;
      }
    }

    const entries = getElementsHtmlByClass('video-item', webpage).map((el) => {
      const attrs = extract_attributes(el);
      const vid = attrs['data-id'];
      return this.url_result(`https://video.kenh14.vn/video/video-${vid}.chn`, 'Kenh14');
    });

    return this.playlist_result(
      entries,
      playlistId,
      clean_html(get_element_by_class('name', categoryDetail) || '') ||
        unescapeHTML(String(embedInfo.name || '')) ||
        playlistId,
      clean_html(get_element_by_class('description', categoryDetail) || '') ||
        unescapeHTML(String(embedInfo.alternateName || '')) ||
        undefined,
    );
  }
}

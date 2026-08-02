/** MegaTVComBaseIE / MegaTVComIE / MegaTVComEmbedIE — ported from yt-dlp megatvcom.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  extract_attributes,
  get_element_by_class,
  get_element_by_id,
  parse_qs,
  unified_timestamp,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class MegaTVComBaseIE extends InfoExtractor {
  static IE_NAME = 'megatvcombase';
  static _PLAYER_DIV_ID = 'player_div_id';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('MegaTVComBaseIE is not a standalone extractor', { expected: true });
  }

  protected _extractPlayerAttrs(webpage: string): Record<string, string> {
    const playerEl = get_element_by_id(MegaTVComBaseIE._PLAYER_DIV_ID, webpage) || '';
    const attrs = extract_attributes(playerEl);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'id') continue;
      out[k.replace(/^data-(?:kwik_)?/, '')] = v;
    }
    return out;
  }
}

export class MegaTVComIE extends MegaTVComBaseIE {
  static IE_NAME = 'megatvcom';
  static IE_DESC = 'megatv.com videos';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?megatv\.com\/(?:\d{4}\/\d{2}\/\d{2}|[^/]+\/(?<id>\d+))\/(?<slug>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let videoId = m.groups!.id;
    const displayId = m.groups!.slug!;
    const isArticle = !videoId;
    const webpage = await this._download_webpage(url, videoId || displayId);
    if (isArticle) {
      videoId = this._search_regex(/<article[^>]*\sid=["']Article_(\d+)["']/, webpage, 'article id')!;
    }
    const playerAttrs = this._extractPlayerAttrs(webpage);
    const title = playerAttrs.label || this._og_search_title(webpage) || videoId!;
    let description = get_element_by_class(isArticle ? 'article-wrapper' : 'story_content', webpage) || '';
    description = clean_html(description.replace(/<script[^>]*>[^<]+<\/script>/g, '')) || this._og_search_description(webpage) || '';
    const thumbnail = playerAttrs.image || this._og_search_thumbnail(webpage) || undefined;
    const timestamp = unified_timestamp(this._html_search_meta('article:published_time', webpage)) ?? undefined;
    const source = playerAttrs.source;
    if (!source) throw new ExtractorError('No source found', { expected: true });

    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    if (determine_ext(source) === 'm3u8') {
      const extracted = await extractM3u8FormatsAndSubtitles(this, source, videoId!, 'hls');
      formats = extracted.formats;
      subtitles = extracted.subtitles;
    } else {
      formats = [{ url: source, format_id: determine_ext(source) || 'http' }];
    }
    if (playerAttrs.subs) mergeSubtitles(subtitles, { und: [{ url: playerAttrs.subs, ext: 'vtt' }] });

    return {
      id: videoId!,
      display_id: displayId,
      title,
      description: description ?? undefined,
      thumbnail,
      timestamp,
      formats,
      subtitles,
    };
  }
}

export class MegaTVComEmbedIE extends MegaTVComBaseIE {
  static IE_NAME = 'megatvcom:embed';
  static IE_DESC = 'megatv.com embedded videos';
  static _VALID_URL = /(?:https?:)?\/\/(?:www\.)?megatv\.com\/embed\/?\?p=(?<id>\d+)/;
  static _EMBED_REGEX = [
    /<iframe[^>]+?src=(["'])(?<url>(?:https?:)?\/\/(?:www\.)?megatv\.com\/embed\/?\?p=\d+)\1/,
  ];

  protected _matchCanonicalUrl(webpage: string): string | null {
    for (const m of webpage.matchAll(/<link[^>]+>/gi)) {
      const attrs = extract_attributes(m[0] || '');
      if (attrs.rel === 'canonical' && attrs.href) return attrs.href;
    }
    return null;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const embedId = this._match_id(url);
    const webpage = await this._download_webpage(url, embedId);
    const playerAttrs = this._extractPlayerAttrs(webpage);
    let canonicalUrl = playerAttrs.share_url || this._matchCanonicalUrl(webpage);
    if (!canonicalUrl) throw new ExtractorError('canonical URL not found', { expected: true });
    const videoId = parse_qs(canonicalUrl).p?.[0] || embedId;
    const resolved = await this._request_webpage({ url: canonicalUrl, headers: { method: 'HEAD' } }, videoId, 'Resolve canonical URL');
    return this.url_result(resolved?.url || canonicalUrl, 'MegaTVCom', videoId);
  }
}

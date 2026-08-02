/**
 * BpbIE — ported from yt-dlp bpb.py (Bundeszentrale für politische Bildung)
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, extract_attributes, join_nonempty, js_to_json, mimetype2ext, unified_strdate, url_or_none } from '../../utils';
import { urljoin } from './_helpers';

function parseResolution(label: unknown): { width?: number; height?: number } {
  const s = label != null ? String(label) : '';
  const m = s.match(/(\d+)x(\d+)/) || s.match(/(\d+)p/);
  if (!m) return {};
  if (m[2]) return { width: Number(m[1]), height: Number(m[2]) };
  return { height: Number(m[1]) };
}

export class BpbIE extends InfoExtractor {
  static IE_NAME = 'bpb';
  static IE_DESC = 'Bundeszentrale für politische Bildung';
  static _VALID_URL = /https?:\/\/(?:www\.|m\.)?bpb\.de\/(?:[^/?#]+\/)*(?<id>\d+)(?:[/?#]|$)/;

  protected _parseVueAttributes(name: string, html: string, videoId: string): Record<string, unknown> {
    const tagMatch = this._search_regex(new RegExp(`(<${name}(?:"[^"]*?"|[^>])*>)`), html, name);
    const attrs: Record<string, unknown> = extract_attributes(tagMatch || '');
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith(':')) {
        attrs[key] = this._parse_json(String(value), videoId, js_to_json, false);
      }
    }
    return attrs;
  }

  protected _processSource(source: Record<string, unknown>): Format | null {
    const url = url_or_none(source.src);
    if (!url) return null;
    const sourceType = (source.type as string) || '';
    const extension = mimetype2ext(sourceType) || undefined;
    const note = this._search_regex(/[_-]([a-z]+)\.[\da-z]+(?:$|\?)/, url, 'note', null, false);
    return {
      url,
      ext: extension,
      vcodec: sourceType.startsWith('video') ? undefined : 'none',
      quality: note === 'high' ? 10 : 0,
      format_note: note || undefined,
      format_id: join_nonempty(extension, note || undefined),
      ...parseResolution(source.label),
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const titleBlock = this._search_regex(
      /<[^>]+class="[^"]*\bopening-header__title\b[^"]*"[^>]*>([\s\S]*?)<\/[a-zA-Z0-9]+>/,
      webpage,
      'title block',
      null,
      false,
    );
    const titleMatch = titleBlock ? titleBlock.match(/(?<title>[^<]*)<[^>]+>(?<series>[^<]*)/) : null;

    const introBlock = this._search_regex(
      /<[^>]+class="[^"]*\bopening-intro\b[^"]*"[^>]*>([\s\S]*?)<\/div>/,
      webpage,
      'intro block',
      null,
      false,
    );

    const jsonLdKeywords = (() => {
      const ld = this._search_json_ld(webpage, videoId, { fatal: false });
      const kw = ld.keywords;
      return typeof kw === 'string' ? kw.split(',') : [];
    })();

    const playerAttrs = this._parseVueAttributes('bpb-player', webpage, videoId);
    const sources = (playerAttrs[':sources'] as Array<Record<string, unknown>>) || [];

    return {
      id: videoId,
      title: titleMatch?.groups?.title?.trim() || undefined,
      series: titleMatch?.groups?.series?.trim() || undefined,
      description: introBlock ? clean_html(introBlock) || undefined : undefined,
      creators: this._html_search_meta('author', webpage) ? [this._html_search_meta('author', webpage)!] : undefined,
      uploader: this._html_search_meta('publisher', webpage) || undefined,
      release_date: unified_strdate(this._html_search_meta('date', webpage)) || undefined,
      tags: jsonLdKeywords,
      formats: sources.map((s) => this._processSource(s)).filter((f): f is Format => !!f),
      thumbnail: playerAttrs.poster ? urljoin(url, String(playerAttrs.poster)) : undefined,
    } as VideoInfo;
  }
}

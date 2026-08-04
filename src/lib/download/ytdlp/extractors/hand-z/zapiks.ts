// @ts-nocheck
/** ZapiksIE â€?ported from yt-dlp zapiks.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  parse_duration,
  parse_resolution,
  str_or_none,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { parseHtmlAttributes } from './_helpers';

export class ZapiksIE extends InfoExtractor {
  static IE_NAME = 'zapiks';
  static _VALID_URL = [
    /https?:\/\/(?:www\.)?zapiks\.(?:com|fr)\/(?<id>[\w-]+)\.html/,
    /https?:\/\/(?:www\.)?zapiks\.fr\/index\.php\?(?:[^#]+&)?media_id=(?<id>\d+)/,
  ];
  static _EMBED_REGEX = [
    /<iframe\b[^>]+\bsrc=["'](?<url>(?:https?:)?\/\/(?:www\.)?zapiks\.fr\/index\.php\?(?:[^#"']+&(?:amp;)?)?media_id=\d+)/,
  ];
  static _UPLOADER_ID_RE = /\/pro(?:fil)?\/(?<id>[^/?#]+)\/?$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const embedSrc = this._search_regex(
      /<[^>]+class=["'][^"']*embed-container[^"']*["'][^>]*>[\s\S]*?<iframe[^>]+src=["'](?<src>[^"']+)/,
      webpage,
      'embed src',
      null,
      false,
      'src',
    );
    if (embedSrc) {
      const absolute = this._proto_relative_url(embedSrc);
      if (!this.suitable(absolute)) return this.url_result(absolute);
    }

    const responsiveTag = this._search_regex(
      /(<[^>]+class=["'][^"']*video-responsive[^"']*["'][^>]*>)/,
      webpage,
      'video responsive',
      null,
      false,
    );
    const attrs = responsiveTag ? parseHtmlAttributes(responsiveTag) : {};
    const dataMediaUrl = url_or_none(attrs['data-media-url']);
    if (dataMediaUrl && new URL(url).pathname === '/index.php') {
      return this.url_result(dataMediaUrl, 'Zapiks');
    }

    let playlist: any = {};
    try {
      playlist = JSON.parse(attrs['data-playlist'] || '[]')?.[0] || {};
    } catch {
      playlist = {};
    }

    const formats: Format[] = [];
    for (const source of (playlist.sources || []) as Array<Record<string, unknown>>) {
      const file = url_or_none(source.file);
      if (!file) continue;
      const formatId = str_or_none(source.label);
      formats.push({
        url: file,
        format_id: formatId || undefined,
        ...(parse_resolution(formatId || '') || {}),
      });
    }

    const desc = this._search_regex(
      /<[^>]+class=["'][^"']*description-text[^"']*["'][^>]*>(?<d>[\s\S]*?)<\/[^>]+>/,
      webpage,
      'description',
      null,
      false,
      'd',
    );
    const uploaderTag = this._search_regex(
      /(<a[^>]+class=["'][^"']*video-content-user-link[^"']*["'][^>]*>[\s\S]*?<\/a>)/,
      webpage,
      'uploader',
      null,
      false,
    );
    const uploaderAttrs = uploaderTag ? parseHtmlAttributes(uploaderTag) : {};
    const uploaderHref = uploaderAttrs.href || '';
    const uploaderId = uploaderHref.match(ZapiksIE._UPLOADER_ID_RE)?.groups?.id || undefined;

    const viewRaw = this._search_regex(
      /<[^>]+class=["'][^"']*video-content-view-counter[^"']*["'][^>]*>(?<v>[\s\S]*?)<\/[^>]+>/,
      webpage,
      'view count',
      null,
      false,
      'v',
    );
    const viewCount = int_or_none((viewRaw || '').replace(/(?:vues|views|\s+)/gi, '')) ?? undefined;

    return {
      id: str_or_none(playlist.mediaid) || displayId,
      display_id: displayId,
      title: clean_html(str_or_none(playlist.title) || '') || displayId,
      description: clean_html(desc || '') || undefined,
      duration: parse_duration(this._html_search_meta('duration', webpage, null, false) || undefined) ?? undefined,
      timestamp: unified_timestamp(this._html_search_meta('uploadDate', webpage, null, false) || undefined) ?? undefined,
      thumbnail: url_or_none(playlist.image) || undefined,
      uploader: clean_html(uploaderTag || '') || undefined,
      uploader_id: uploaderId,
      view_count: viewCount,
      formats,
    };
  }
}

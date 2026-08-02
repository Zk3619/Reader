/** TNAFlix network — ported from yt-dlp tnaflix.py */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  parse_duration,
  str_to_int,
  unescapeHTML,
  str_or_none,
} from '../../utils';
import { hiddenInputs, rtaSearch, xmlTagText } from './_helpers';

function fixXmlAmpersands(src: string): string {
  return src.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/g, '&amp;');
}

function urlBasename(u: string): string {
  try {
    return new URL(u).pathname.split('/').pop() || u;
  } catch {
    return u.split('/').pop() || u;
  }
}

export class TNAFlixNetworkBaseIE extends InfoExtractor {
  static IE_NAME = 'tnaflixnetworkbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected _CONFIG_REGEX = [
    /flashvars\.config\s*=\s*escape\("(?<url>[^"]+)"/,
    /<input[^>]+name="config\d?" value="(?<url>[^"]+)"/,
    /config\s*=\s*(["'])(?<url>(?:https?:)?\/\/(?:(?!\1).)+)\1/,
  ];
  protected _TITLE_REGEX = /<input[^>]+name="title" value="([^"]+)"/;
  protected _DESCRIPTION_REGEX = /<input[^>]+name="description" value="([^"]+)"/;
  protected _UPLOADER_REGEX = /<input[^>]+name="username" value="([^"]+)"/;
  protected _VIEW_COUNT_REGEX: RegExp | null = null;
  protected _COMMENT_COUNT_REGEX: RegExp | null = null;
  protected _AVERAGE_RATING_REGEX: RegExp | null = null;
  protected _CATEGORIES_REGEX =
    /<li[^>]*>\s*<span[^>]+class="infoTitle"[^>]*>Categories:<\/span>\s*<span[^>]+class="listView"[^>]*>(.+?)<\/span>\s*<\/li>/s;

  protected _extractThumbnails(cfgXml: string): Thumbnail[] | undefined {
    const pattern = xmlTagText(cfgXml, 'pattern') || xmlTagText(cfgXml, 'imagePattern');
    const firstText = xmlTagText(cfgXml, 'first') || xmlTagText(cfgXml, 'imageFirst');
    const lastText = xmlTagText(cfgXml, 'last') || xmlTagText(cfgXml, 'imageLast');
    if (!pattern || !firstText || !lastText) return undefined;
    if (!/^\d+$/.test(firstText) || !/^\d+$/.test(lastText)) return undefined;
    const first = parseInt(firstText, 10);
    const last = parseInt(lastText, 10);
    if (first > last) return undefined;
    const width = int_or_none(xmlTagText(cfgXml, 'imageWidth'));
    const height = int_or_none(xmlTagText(cfgXml, 'imageHeight'));
    const out: Thumbnail[] = [];
    for (let i = first; i <= last; i++) {
      const thumbUrl = pattern.replace('#', String(i));
      out.push({
        url: thumbUrl.startsWith('//') ? `http:${thumbUrl}` : thumbUrl,
        width: width ?? undefined,
        height: height ?? undefined,
      });
    }
    return out;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const host = m.groups!.host!;
    const displayId =
      m.groups!.display_id || m.groups!.display_id_2 || videoId;

    const webpage = await this._download_webpage(url, displayId);
    const inputs = hiddenInputs(webpage);
    const query: Record<string, string> = {};

    let cfgUrl = this._html_search_regex(
      this._CONFIG_REGEX,
      webpage,
      'flashvars.config',
      undefined,
      false,
      'url',
    );
    if (cfgUrl?.startsWith('//')) cfgUrl = `http:${cfgUrl}`;

    if (!cfgUrl) cfgUrl = inputs.config;

    if (!cfgUrl && inputs.vkey && inputs.nkey) {
      cfgUrl = `http://cdn-fck.${host}.com/${host}/${inputs.vkey}.fid`;
      Object.assign(query, {
        key: inputs.nkey,
        VID: videoId,
        premium: '1',
        vip: '1',
        alpha: '',
      });
    }

    const formats: Format[] = [];
    let jsonLd: Record<string, unknown> = {};
    let thumbnails: Thumbnail[] | undefined;

    if (cfgUrl) {
      const cfgXml = await this._download_webpage(cfgUrl, displayId, 'Downloading metadata', {
        headers: { Referer: url },
        query,
      });
      const fixed = fixXmlAmpersands(cfgXml);

      const videoLink = xmlTagText(fixed, 'videoLink');
      if (videoLink) {
        formats.push({
          url: unescapeHTML(videoLink),
          ext: xmlTagText(fixed, 'type') || 'flv',
          format_id: 'default',
        });
      }

      for (const itemBlock of fixed.match(/<item>[\s\S]*?<\/item>/gi) || []) {
        const vLink = xmlTagText(itemBlock, 'videoLink');
        if (!vLink) continue;
        const formatId = xmlTagText(itemBlock, 'res');
        const height = formatId ? int_or_none(formatId.match(/^(\d+)[pP]/)?.[1]) : null;
        let vUrl = unescapeHTML(vLink);
        if (vUrl.startsWith('//')) vUrl = `http:${vUrl}`;
        formats.push({
          url: vUrl,
          format_id: formatId || '0',
          height: height ?? undefined,
        });
      }

      thumbnails = this._extractThumbnails(fixed) || [];
      const startThumb = xmlTagText(fixed, 'startThumb');
      if (startThumb) {
        thumbnails.push({
          url: startThumb.startsWith('//') ? `http:${startThumb}` : startThumb,
        });
      }
    } else {
      const player = (
        await this._download_json<{ html?: string }>(
          `http://www.${host}.com/ajax/video-player/${videoId}`,
          videoId,
          undefined,
          { headers: { Referer: url } },
        )
      ).html || '';
      for (const srcMatch of player.matchAll(/<source src="(?<src>[^"]+)"/g)) {
        const videoUrl = srcMatch.groups!.src!;
        const height = videoUrl.match(/-(\d+)p\./)?.[1];
        const base = urlBasename(videoUrl);
        formats.push({
          url: videoUrl.startsWith('//') ? `http:${videoUrl}` : videoUrl,
          ext: base.split('.').pop() || 'mp4',
          height: int_or_none(height) ?? undefined,
          format_id: height ? `${height}p` : base.split('.')[0],
        });
      }
      const thumbMatch = player.match(/data-poster="([^"]+)"/);
      if (thumbMatch?.[1]) {
        const t = thumbMatch[1].startsWith('//') ? `http:${thumbMatch[1]}` : thumbMatch[1];
        thumbnails = [{ url: t }];
      }
      jsonLd = this._search_json_ld(webpage, displayId, { fatal: false }) || {};
    }

    const extractField = (pattern: RegExp | null, name: string): string | undefined =>
      pattern
        ? this._html_search_regex(pattern, webpage, name, undefined, false) || undefined
        : undefined;

    return {
      id: videoId,
      display_id: displayId,
      title:
        extractField(this._TITLE_REGEX, 'title') ||
        this._og_search_title(webpage, false) ||
        str_or_none(jsonLd.title) ||
        displayId,
      description:
        extractField(this._DESCRIPTION_REGEX, 'description') ||
        str_or_none(jsonLd.description) ||
        undefined,
      thumbnails,
      duration:
        parse_duration(
          this._html_search_meta('duration', webpage, 'duration', false),
        ) ||
        (typeof jsonLd.duration === 'number' ? jsonLd.duration : undefined),
      age_limit: rtaSearch(webpage) ?? 18,
      uploader:
        extractField(this._UPLOADER_REGEX, 'uploader') ||
        str_or_none(jsonLd.uploader) ||
        undefined,
      view_count: str_to_int(extractField(this._VIEW_COUNT_REGEX, 'view count')) ?? undefined,
      comment_count:
        str_to_int(extractField(this._COMMENT_COUNT_REGEX, 'comment count')) ?? undefined,
      average_rating:
        float_or_none(extractField(this._AVERAGE_RATING_REGEX, 'average rating')) ?? undefined,
      categories: (extractField(this._CATEGORIES_REGEX, 'categories') || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
      formats,
    };
  }
}

export class TNAFlixNetworkEmbedIE extends TNAFlixNetworkBaseIE {
  static IE_NAME = 'tnaflix:embed';
  static _VALID_URL = /https?:\/\/player\.(?<host>tnaflix|empflix)\.com\/video\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const { id: videoId, host } = m.groups!;
    return this.url_result(`http://www.${host}.com/category/${videoId}/video${videoId}`);
  }
}

export class TNAEMPFlixBaseIE extends TNAFlixNetworkBaseIE {
  static IE_NAME = 'tnaempflixbase';
  protected _DESCRIPTION_REGEX = />Description:<\/[^>]+>(.+?)</s;
  protected _UPLOADER_REGEX = /<span>by\s*<a[^>]+\bhref=["']\/profile\/[^>]+>([^<]+)</;
  protected _CATEGORIES_REGEX = /<span[^>]*>Categories:<\/span>(.+?)<\/div>/s;
}

export class TNAFlixIE extends TNAEMPFlixBaseIE {
  static IE_NAME = 'tnaflix';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<host>tnaflix)\.com\/[^/]+\/(?<display_id>[^/]+)\/video(?<id>\d+)/;
  protected _TITLE_REGEX = /<title>(.+?) - (?:TNAFlix Porn Videos|TNAFlix\.com)<\/title>/;
}

export class EMPFlixIE extends TNAEMPFlixBaseIE {
  static IE_NAME = 'empflix';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<host>empflix)\.com\/(?:videos\/(?<display_id>.+?)-|[^/]+\/(?<display_id_2>[^/]+)\/video)(?<id>[0-9]+)/;
}

export class MovieFapIE extends TNAFlixNetworkBaseIE {
  static IE_NAME = 'moviefap';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<host>moviefap)\.com\/videos\/(?<id>[0-9a-f]+)\/(?<display_id>[^/]+)\.html/;
  protected _VIEW_COUNT_REGEX = /<br>Views\s*<strong>([\d,.]+)<\/strong>/;
  protected _COMMENT_COUNT_REGEX = /<span[^>]+id="comCount"[^>]*>([\d,.]+)<\/span>/;
  protected _AVERAGE_RATING_REGEX = /Current Rating\s*<br>\s*<strong>([\d.]+)<\/strong>/;
  protected _CATEGORIES_REGEX = /<div[^>]+id="vid_info"[^>]*>\s*<div[^>]*>.+?<\/div>(.*?)<br>/s;
}

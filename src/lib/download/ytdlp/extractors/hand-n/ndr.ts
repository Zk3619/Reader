/**
 * NDR family — ported from yt-dlp ndr.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import { determine_ext, int_or_none, merge_dicts, url_or_none } from '../../utils';
import { parseIso8601, qualityRank, urljoin } from './_helpers';

export class NDRBaseIE extends InfoExtractor {
  static IE_NAME = 'ndrbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = Object.values(m.groups || {}).find(Boolean) || this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    return this._extractEmbed(webpage, displayId, url);
  }

  protected async _extractEmbed(_webpage: string, _displayId: string, _pageUrl: string): Promise<VideoInfo> {
    throw new ExtractorError('Subclass must implement _extractEmbed', { expected: true });
  }
}

export class NDRIE extends NDRBaseIE {
  static IE_NAME = 'ndr';
  static _VALID_URL =
    /https?:\/\/(?:\w+\.)*ndr\.de\/(?:[^/]+\/)*(?<id>[^/?#]+),[\da-z]+\.html/;

  protected async _extractEmbed(webpage: string, displayId: string, pageUrl: string): Promise<VideoInfo> {
    let embedUrl =
      this._html_search_meta('embedURL', webpage, 'embed URL', false) ||
      this._search_regex(/\bembedUrl["']\s*:\s*(["'])(?<url>(?:(?!\1).)+)\1/, webpage, 'embed URL', 'url', false) ||
      this._search_regex(/\bvar\s*sophoraID\s*=\s*(["'])(?<url>(?:(?!\1).)+)\1/, webpage, 'embed URL', 'url', false) ||
      '';

    if (/^[a-z]+\d+$/.test(embedUrl)) {
      const pathMatch = new URL(pageUrl).pathname.match(new RegExp(`(.+/)${displayId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      const path = pathMatch?.[1] || '';
      const ndrId = this._search_regex(new RegExp(`${path}([a-z]+\\d+)(?!\\.)\\b`), webpage, 'embed URL', undefined, false);
      embedUrl = ndrId ? `ndr:${ndrId}` : `https://www.ndr.de/info/${embedUrl}-player.html`;
    }
    if (!embedUrl) throw new ExtractorError('Unable to extract embedUrl');

    const description =
      this._search_regex(/<p[^>]+itemprop="description">([^<]+)<\/p>/, webpage, 'description', undefined, false) ||
      this._og_search_description(webpage) ||
      undefined;
    const timestamp = parseIso8601(
      this._search_regex(
        /<span[^>]+itemprop="(?:datePublished|uploadDate)"[^>]+content="(?<cont>[^"]+)"|\bvar\s*pdt\s*=\s*(?<q>["'])(?<cont>(?:(?!\q).)+)\q/,
        webpage,
        'upload date',
        'cont',
        false,
      ) || undefined,
    );

    const ld = this._search_json_ld(webpage, displayId, { fatal: false }) || {};
    return merge_dicts(
      {
        _type: 'url_transparent',
        url: embedUrl,
        display_id: displayId,
        description,
        timestamp,
      },
      ld,
    ) as VideoInfo;
  }
}

export class NJoyIE extends NDRBaseIE {
  static IE_NAME = 'njoy';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?n-joy\.de\/(?:[^/]+\/)*(?:(?<display_id>[^/?#]+),)?(?<id>[\da-z]+)\.html/;

  protected async _extractEmbed(webpage: string, displayId: string, _pageUrl?: string): Promise<VideoInfo> {
    const videoId =
      this._search_regex(/\bsrc\s*=\s*["']?(?:\/\w+)+\/([a-z]+\d+)(?!\.)\b/, webpage, 'NDR id', undefined, false) ||
      this._search_regex(/<iframe[^>]+id="pp_([\da-z]+)"/, webpage, 'NDR id', undefined, false);
    const description =
      this._html_search_meta('description', webpage) ||
      this._search_regex(/<div[^>]+class="subline"[^>]*>[^<]+<\/div>\s*<p>([^<]+)<\/p>/, webpage, 'description', undefined, false) ||
      undefined;
    return {
      _type: 'url_transparent',
      ie_key: 'NDREmbedBase',
      id: displayId,
      url: videoId ? `ndr:${videoId}` : undefined,
      display_id: displayId,
      description,
      title: displayId.replace(/-/g, ' ').trim(),
    };
  }
}

export class NDREmbedBaseIE extends InfoExtractor {
  static IE_NAME = 'ndr:embed:base';
  static _VALID_URL =
    /(?:ndr:(?<id_s>[\da-z]+)|https?:\/\/www\.ndr\.de\/(?<id>[\da-z]+)-ppjson\.json)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id || m.groups?.id_s || '';

    const ppjson = await this._download_json<Record<string, unknown>>(
      `http://www.ndr.de/${videoId}-ppjson.json`,
      videoId,
    );
    const playlist = (ppjson.playlist as Record<string, Record<string, unknown>>) || {};
    const qualityKey = qualityRank(['xs', 's', 'm', 'l', 'xl']);
    const formats: Format[] = [];

    for (const [formatId, f] of Object.entries(playlist)) {
      if (formatId === 'config') continue;
      const src = f.src as string | undefined;
      if (!src) continue;
      const ext = determine_ext(src);
      if (ext === 'f4m') {
        formats.push({ url: `${src}?hdcore=3.7.0&plugin=aasp-3.7.0.39.44`, format_id: 'hds', ext: 'flv' });
      } else if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(src, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else {
        const quality = f.quality as string | undefined;
        const ff: Format = {
          url: src,
          format_id: quality || formatId,
          quality: quality ? qualityKey(quality) : undefined,
        };
        const type = (f.type as string | undefined)?.split('/')[0];
        if (type === 'audio') {
          ff.vcodec = 'none';
          ff.ext = ext || 'mp3';
        }
        formats.push(ff);
      }
    }

    const config = (playlist.config as Record<string, unknown>) || {};
    const ppConfig = (ppjson.config as Record<string, unknown>) || {};
    const live = ['httpVideoLive', 'httpAudioLive'].includes(
      String((playlist.config as Record<string, unknown>)?.streamType ?? ''),
    );
    const uploadDate = ppConfig.publicationDate as string | undefined;
    const thumbnails: Thumbnail[] = [];
    const poster = (config.poster as Record<string, Record<string, unknown>>) || {};
    for (const [thumbnailId, thumbnail] of Object.entries(poster)) {
      const thumbnailUrl = urljoin(url, url_or_none(thumbnail.src) || '');
      if (!thumbnailUrl) continue;
      thumbnails.push({
        id: (thumbnail.quality as string) || thumbnailId,
        url: thumbnailUrl,
        preference: qualityKey(thumbnail.quality as string),
      });
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const track of (config.tracks as Array<Record<string, unknown>>) || []) {
      const trackUrl = urljoin(url, url_or_none(track.src) || '');
      if (!trackUrl) continue;
      const lang = (track.srclang as string) || 'de';
      (subtitles[lang] ||= []).push({ url: trackUrl, ext: 'ttml' });
    }

    return {
      id: videoId,
      title: String(config.title ?? videoId),
      is_live: live,
      uploader: ppConfig.branding !== '-' ? (ppConfig.branding as string) : undefined,
      upload_date: uploadDate?.slice(0, 8),
      duration: int_or_none(config.duration) ?? undefined,
      thumbnails,
      formats,
      subtitles,
    };
  }
}

export class NDREmbedIE extends NDREmbedBaseIE {
  static IE_NAME = 'ndr:embed';
  static _VALID_URL =
    /https?:\/\/(?:\w+\.)*ndr\.de\/(?:[^/]+\/)*(?<id>[\da-z]+)-(?:(?:ard)?player|externalPlayer)\.html/;
}

export class NJoyEmbedIE extends NDREmbedBaseIE {
  static IE_NAME = 'njoy:embed';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?n-joy\.de\/(?:[^/]+\/)*(?<id>[\da-z]+)-(?:player|externalPlayer)_[^/]+\.html/;
}

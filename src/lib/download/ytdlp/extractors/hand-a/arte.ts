/**
 * ArteTV* IEs — aligned with yt-dlp arte.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_qs, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601, playlistFromMatches } from './helpers';

export class ArteTVBaseIE extends InfoExtractor {
  static IE_NAME = 'ArteTVBase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _ARTE_LANGUAGES = 'fr|de|en|es|it|pl';
  static _API_BASE = 'https://api.arte.tv/api/player/v2';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ArteTVBaseIE is not a standalone extractor', { expected: true });
  }
}

export class ArteTVIE extends ArteTVBaseIE {
  static IE_NAME = 'artetv';
  static _VALID_URL = new RegExp(
    `(?:https?:\\/\\/(?:` +
      `(?:www\\.)?arte\\.tv\\/(?<lang>${ArteTVBaseIE._ARTE_LANGUAGES})\\/videos|` +
      `api\\.arte\\.tv\\/api\\/player\\/v\\d+\\/config\\/(?<lang_2>${ArteTVBaseIE._ARTE_LANGUAGES})` +
      `)|arte:\\/\\/program)\\/(?<id>\\d{6}-\\d{3}-[AF]|LIVE)`,
    'i',
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? m[3] ?? '';
    const lang = m.groups?.lang || m.groups?.lang_2 || 'de';

    const config = await this._download_json<Record<string, unknown>>(
      `${ArteTVBaseIE._API_BASE}/config/${lang}/${videoId}`,
      videoId,
      undefined,
      { headers: { 'x-validated-age': '18' } },
    );

    const geoblocking = traverse_obj(config, ['data', 'attributes', 'restriction', 'geoblocking']) as
      | Record<string, unknown>
      | undefined;
    if (geoblocking?.restrictedArea) {
      this.raise_geo_restricted(`Video restricted to ${String(geoblocking.code)}`);
    }
    if (!traverse_obj(config, ['data', 'attributes', 'rights'])) {
      throw new ExtractorError(
        'Video is not available in this language edition of Arte or broadcast rights expired',
        { expected: true },
      );
    }

    const formats: Format[] = [];
    const streams = traverse_obj(config, ['data', 'attributes', 'streams']) as
      | Record<string, unknown>[]
      | undefined;
    const hlsHeaders = {
      Referer: 'https://www.arte.tv/',
      Origin: 'https://www.arte.tv',
    };

    for (const stream of streams || []) {
      const protocol = String(stream.protocol || '');
      const streamUrl = url_or_none(stream.url);
      if (!streamUrl) continue;

      const version0 = traverse_obj(stream, ['versions', 0]) as Record<string, unknown> | undefined;
      const ml5 = String(traverse_obj(version0, ['eStat', 'ml5']) || version0?.code || 'stream');
      const label = String(version0?.label || version0?.shortLabel || ml5);

      if (/HLS/i.test(protocol)) {
        try {
          const hls = await this._extract_m3u8_formats_and_subtitles(
            streamUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            ml5,
            undefined,
            false,
            { headers: hlsHeaders },
          );
          for (const fmt of hls.formats) {
            fmt.format_note = label;
            if (!fmt.http_headers) fmt.http_headers = { ...hlsHeaders };
          }
          formats.push(...hls.formats);
        } catch {
          /* fall through to raw master */
        }
        // CMAF / 主清单解析失败时仍保留 master URL，供引擎原生 HLS 路径消费
        if (!formats.some((f) => f.manifest_url === streamUrl || f.url === streamUrl)) {
          formats.push({
            format_id: `hls-${ml5}`,
            url: streamUrl,
            manifest_url: streamUrl,
            ext: 'mp4',
            protocol: 'm3u8_native',
            vcodec: 'unknown',
            acodec: 'unknown',
            format_note: label,
            http_headers: { ...hlsHeaders },
          });
        }
      } else if (protocol === 'HTTPS' || protocol === 'RTMP') {
        formats.push({
          format_id: `${protocol}-${ml5}`,
          url: streamUrl,
          format_note: label,
          http_headers: { ...hlsHeaders },
        });
      } else {
        this.report_warning(`Skipping stream with unknown protocol ${protocol}`);
      }
    }

    if (!formats.length) {
      throw new ExtractorError('No playable streams returned by Arte player API', {
        expected: true,
      });
    }

    const metadata = traverse_obj(config, ['data', 'attributes', 'metadata']) as Record<
      string,
      unknown
    >;
    const images = (metadata?.images as Record<string, unknown>[]) || [];

    return {
      id: String(metadata?.providerId || videoId),
      title: str_or_none(metadata?.subtitle || metadata?.title) || videoId,
      alt_title: metadata?.subtitle && metadata?.title ? String(metadata.title) : undefined,
      description: str_or_none(metadata?.description) || null,
      duration: int_or_none(traverse_obj(metadata, ['duration', 'seconds'])) ?? undefined,
      language: str_or_none(metadata?.language) || undefined,
      timestamp:
        parseIso8601(traverse_obj(config, ['data', 'attributes', 'rights', 'begin'])) ?? undefined,
      is_live: traverse_obj(config, ['data', 'attributes', 'live']) === true,
      formats,
      thumbnails: images
        .map((img) =>
          url_or_none(img.url)
            ? { url: String(img.url), id: str_or_none(img.caption) || undefined }
            : null,
        )
        .filter(Boolean) as VideoInfo['thumbnails'],
      original_url: url,
      webpage_url: url,
      extractor: 'artetv',
      extractor_key: 'ArteTV',
      http_headers: hlsHeaders,
    };
  }
}

export class ArteTVEmbedIE extends InfoExtractor {
  static IE_NAME = 'artetvembed';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?arte\.tv\/player\/v\d+\/index\.php\?.*?\bjson_url=.+/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const qs = parse_qs(url);
    const jsonUrl = qs.json_url?.[0];
    if (!jsonUrl) throw new ExtractorError('Missing json_url', { expected: true });
    const videoId =
      this._search_regex(
        /\/(?:config\/[a-z]{2}\/|videos\/)(?<id>\d{6}-\d{3}-[AF]|LIVE)/i,
        jsonUrl,
        'video id',
        undefined,
        false,
        'id',
      ) || undefined;
    return this.url_result(jsonUrl, 'ArteTV', videoId);
  }
}

export class ArteTVPlaylistIE extends ArteTVBaseIE {
  static IE_NAME = 'artetvplaylist';
  static _VALID_URL = new RegExp(
    `https?:\\/\\/(?:www\\.)?arte\\.tv\\/(?<lang>${ArteTVBaseIE._ARTE_LANGUAGES})\\/videos\\/(?<id>RC-\\d{6})`,
    'i',
  );
  static _API_TOKEN =
    'Nzc1Yjc1ZjJkYjk1NWFhN2I2MWEwMmRlMzAzNjI5NmU3NWU3ODg4ODJjOWMxNTMxYzEzZGRjYjg2ZGE4MmIwOA';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const lang = m.groups?.lang ?? m[1] ?? 'de';
    const playlistId = m.groups?.id ?? m[2] ?? '';

    const playlistInfo = await this._download_json<Record<string, unknown>>(
      `https://api.arte.tv/api/opa/v3/programs/${lang}/${playlistId}`,
      playlistId,
      undefined,
      { headers: { Authorization: `Bearer ${ArteTVPlaylistIE._API_TOKEN}` } },
    );
    const program = traverse_obj(playlistInfo, ['programs', 0]) as Record<string, unknown> | undefined;
    const metadata = {
      title: str_or_none(program?.title) || playlistId,
      description: str_or_none(program?.shortDescription) || null,
    };

    const seasonIds = ((program?.children as Record<string, unknown>[]) || [])
      .filter((c) => c.catalogType === 'SEASON')
      .map((c) => String(c.programId));

    if (seasonIds.length) {
      const entries: VideoInfo[] = [];
      for (const seasonId of seasonIds) {
        const seasonData = await this._download_json<Record<string, unknown>>(
          `${ArteTVBaseIE._API_BASE}/playlist/${lang}/${seasonId}`,
          seasonId,
          undefined,
          { headers: { 'x-validated-age': '18' } },
        );
        for (const video of (traverse_obj(seasonData, ['data', 'attributes', 'items']) as Record<string, unknown>[]) || []) {
          const link = url_or_none(traverse_obj(video, ['link', 'url']));
          if (!link) continue;
          entries.push(
            this.url_result(link, 'ArteTV', str_or_none(video.providerId) || undefined, str_or_none(video.title) || undefined),
          );
        }
      }
      return this.playlist_result(entries, playlistId, metadata.title, metadata.description);
    }

    const shows = ((program?.videos as Record<string, unknown>[]) || []).filter(
      (v) => v.kind === 'SHOW' && url_or_none(v.url),
    );
    return this.playlist_result(
      shows.map((s) => this.url_result(String(s.url), 'ArteTV')),
      playlistId,
      metadata.title,
      metadata.description,
    );
  }
}

export class ArteTVCategoryIE extends ArteTVBaseIE {
  static IE_NAME = 'artetvcategory';
  static _VALID_URL = new RegExp(
    `https?:\\/\\/(?:www\\.)?arte\\.tv\\/(?<lang>${ArteTVBaseIE._ARTE_LANGUAGES})\\/videos\\/(?<id>[\\w-]+(?:\\/[\\w-]+)*)\\/?\\s*$`,
    'i',
  );

  static suitable(url: string): boolean {
    if (ArteTVIE.suitable(url) || ArteTVPlaylistIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const lang = m.groups?.lang ?? m[1] ?? 'de';
    const playlistId = m.groups?.id ?? m[2] ?? '';
    const webpage = await this._download_webpage(url, playlistId);

    const items: string[] = [];
    const linkRe = new RegExp(
      `<a\\b[^>]*?href\\s*=\\s*(["'])https?:\\/\\/www\\.arte\\.tv\\/${lang}\\/videos\\/[\\w\\/-]+\\1`,
      'gi',
    );
    for (const match of webpage.matchAll(linkRe)) {
      const href = match[0].match(/href\s*=\s*(["'])(https?:\/\/www\.arte\.tv\/[^"']+)\1/i)?.[2];
      if (!href || href === url) continue;
      if (ArteTVIE.suitable(href) || ArteTVPlaylistIE.suitable(href)) items.push(href);
    }

    const title = this._og_search_title(webpage)?.split('|')[0]?.trim() || playlistId;

    return playlistFromMatches(this, items, playlistId, {
      title,
      description: this._og_search_description(webpage),
      ie: 'ArteTV',
    });
  }
}

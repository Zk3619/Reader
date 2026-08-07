/**
 * GenericIE — direct media URLs, basic HLS (m3u8), Brightcove/Kaltura embed hooks.
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';
import { extractBrightcoveEmbedUrls } from './brightcove';
import { extractKalturaEmbedUrls } from './kaltura';

const MEDIA_EXT =
  /\.(?:mp4|m4a|m4v|webm|mkv|flv|mp3|aac|opus|ogg|wav|flac|mov|avi|ts|m3u8)(?:$|\?)/i;

export class GenericIE extends InfoExtractor {
  static IE_NAME = 'generic';
  static IE_DESC = 'Generic downloader for direct media / m3u8';
  static _VALID_URL = /.*/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const cleaned = url.trim();
    if (!/^https?:\/\//i.test(cleaned) && !cleaned.startsWith('//')) {
      throw new ExtractorError(`Unsupported URL: ${url}`, { expected: true });
    }
    const absolute = cleaned.startsWith('//') ? `https:${cleaned}` : cleaned;

    // Force-check content-type via HEAD-ish GET when extension unknown
    const isM3u8 = /\.m3u8(?:$|\?)/i.test(absolute);
    const looksMedia = MEDIA_EXT.test(absolute) || isM3u8;

    let title: string | null = null;
    let thumbnail: string | null = null;
    let description: string | null = null;
    let mediaUrl = absolute;
    let formats: Format[] = [];

    if (!looksMedia) {
      // Try webpage scrape for og:video / json-ld / m3u8 links
      const html = await this._download_webpage(absolute, 'generic', 'Downloading webpage', {
        fatal: false,
      });
      if (html) {
        const embedUrls = [
          ...extractBrightcoveEmbedUrls(html),
          ...extractKalturaEmbedUrls(html),
        ];
        if (embedUrls.length === 1) {
          const embed = embedUrls[0]!;
          const ie = embed.startsWith('kaltura:') ? 'Kaltura' : 'BrightcoveNew';
          return this.url_result(embed, ie, safeId(absolute));
        }
        if (embedUrls.length > 1) {
          return this.playlist_result(
            embedUrls.map((embed, i) => {
              const ie = embed.startsWith('kaltura:') ? 'Kaltura' : 'BrightcoveNew';
              return this.url_result(embed, ie, String(i));
            }),
            safeId(absolute),
            safeId(absolute),
          );
        }

        title = this._og_search_title(html) || this._html_search_regex(
          /<title[^>]*>([^<]+)<\/title>/i,
          html,
          'title',
          null,
          false,
        );
        thumbnail = this._og_search_thumbnail(html);
        description = this._og_search_description(html);
        const ogVideo = this._og_search_video_url(html);
        const jsonLd = this._search_json_ld(html, 'generic', { fatal: false });
        const ldContent =
          (jsonLd.contentUrl as string) ||
          (jsonLd.embedUrl as string) ||
          (typeof jsonLd.url === 'string' ? jsonLd.url : null);

        mediaUrl = ogVideo || ldContent || absolute;

        // Collect m3u8 / mp4 / mpd / f4m / smil links from page
        const m3u8Links = [...html.matchAll(/https?:\/\/[^"'\\\s>]+\.m3u8[^"'\\\s>]*/gi)].map(
          (m) => m[0]!,
        );
        const mp4Links = [...html.matchAll(/https?:\/\/[^"'\\\s>]+\.mp4[^"'\\\s>]*/gi)].map(
          (m) => m[0]!,
        );
        const mpdLinks = [...html.matchAll(/https?:\/\/[^"'\\\s>]+\.mpd[^"'\\\s>]*/gi)].map(
          (m) => m[0]!,
        );
        const f4mLinks = [...html.matchAll(/https?:\/\/[^"'\\\s>]+\.f4m[^"'\\\s>]*/gi)].map(
          (m) => m[0]!,
        );
        const smilLinks = [...html.matchAll(/https?:\/\/[^"'\\\s>]+\.smil[^"'\\\s>]*/gi)].map(
          (m) => m[0]!,
        );

        // JWPlayer setup on page
        try {
          const jw = this._find_jwplayer_data(html, 'generic');
          if (jw) {
            const parsed = await this._parse_jwplayer_data(jw, safeId(absolute), {
              requireTitle: false,
            });
            if (parsed.formats?.length) {
              return {
                ...parsed,
                id: parsed.id || safeId(absolute),
                webpage_url: absolute,
                extractor: 'generic',
                extractor_key: 'Generic',
              };
            }
          }
        } catch {
          /* ignore jw */
        }

        // twitter:player / iframe embeds
        const twPlayer = html.match(
          /(?:twitter:player|twitter:player:stream)[^>]+content=["']([^"']+)["']/i,
        );
        if (twPlayer?.[1]) {
          return this.url_result(twPlayer[1], undefined, safeId(absolute));
        }

        let idx = 0;
        for (const u of unique(
          [mediaUrl, ...m3u8Links, ...mp4Links, ...mpdLinks, ...f4mLinks, ...smilLinks].filter(
            Boolean,
          ) as string[],
        )) {
          formats.push(this._formatFromUrl(u, String(idx++)));
        }

        // Expand DASH / F4M / SMIL via common helpers when single manifest
        if (formats.length === 1 && /\.mpd(?:$|\?)/i.test(formats[0]!.url || '')) {
          try {
            formats = await this._extract_mpd_formats(formats[0]!.url!, 'generic', 'dash', undefined, false);
          } catch {
            /* keep */
          }
        }
        if (formats.length === 1 && /\.f4m(?:$|\?)/i.test(formats[0]!.url || '')) {
          try {
            formats = await this._extract_f4m_formats(formats[0]!.url!, 'generic', 'hds', undefined, false);
          } catch {
            /* keep */
          }
        }
        if (formats.length === 1 && /\.smil(?:$|\?)/i.test(formats[0]!.url || '')) {
          try {
            formats = await this._extract_smil_formats(formats[0]!.url!, 'generic', false);
          } catch {
            /* keep */
          }
        }
      }
    }

    if (!formats.length) {
      formats = [this._formatFromUrl(mediaUrl, '0')];
    }

    // Expand basic master m3u8 into variant formats when possible
    if (formats.some((f) => (f.url || '').includes('.m3u8'))) {
      formats = await this._expandM3u8(formats);
    }

    const id = safeId(absolute);
    return {
      id,
      title: title || id,
      description,
      thumbnail: thumbnail || undefined,
      thumbnails: thumbnail ? [this._thumbnail(thumbnail)] : undefined,
      webpage_url: absolute,
      extractor: 'generic',
      extractor_key: 'Generic',
      formats,
      ext: formats[0]?.ext,
      url: formats[0]?.url,
    };
  }

  private _formatFromUrl(mediaUrl: string, format_id: string): Format {
    const isM3u8 = /\.m3u8(?:$|\?)/i.test(mediaUrl);
    const isMpd = /\.mpd(?:$|\?)/i.test(mediaUrl);
    const isF4m = /\.f4m(?:$|\?)/i.test(mediaUrl);
    const isSmil = /\.smil(?:$|\?)/i.test(mediaUrl);
    const ext = isM3u8 || isMpd || isF4m ? 'mp4' : guessExt(mediaUrl);
    const audioOnly = ['mp3', 'm4a', 'aac', 'opus', 'ogg', 'wav', 'flac'].includes(ext);
    let protocol: string = 'https';
    if (isM3u8) protocol = 'm3u8_native';
    else if (isMpd) protocol = 'http_dash_segments';
    else if (isF4m) protocol = 'f4m';
    else if (isSmil) protocol = 'smil';
    return {
      format_id,
      url: mediaUrl,
      ext,
      protocol,
      vcodec: audioOnly ? 'none' : undefined,
      acodec: undefined,
      http_headers: { Referer: mediaUrl },
    };
  }

  private async _expandM3u8(formats: Format[]): Promise<Format[]> {
    const out: Format[] = [];
    for (const f of formats) {
      const url = f.url;
      if (!url || !url.includes('.m3u8')) {
        out.push(f);
        continue;
      }
      try {
        const body = await this._download_webpage(url, 'm3u8', 'Downloading m3u8', {
          fatal: false,
          headers: { Referer: url },
        });
        if (!body) {
          out.push(f);
          continue;
        }
        if (/#EXT-X-STREAM-INF/i.test(body)) {
          const variants = parseMasterPlaylist(body, url);
          if (variants.length) {
            out.push(...variants);
            continue;
          }
        }
        out.push(f);
      } catch {
        out.push(f);
      }
    }
    return out.length ? out : formats;
  }
}

function parseMasterPlaylist(body: string, baseUrl: string): Format[] {
  const lines = body.split(/\r?\n/);
  const formats: Format[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
    const next = lines[i + 1]?.trim();
    if (!next || next.startsWith('#')) continue;
    const bandwidth = Number(line.match(/BANDWIDTH=(\d+)/i)?.[1] || 0);
    const res = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    const width = res ? Number(res[1]) : null;
    const height = res ? Number(res[2]) : null;
    let variantUrl: string;
    try {
      variantUrl = new URL(next, baseUrl).toString();
    } catch {
      variantUrl = next;
    }
    formats.push({
      format_id: height ? `hls-${height}` : `hls-${bandwidth || formats.length}`,
      url: variantUrl,
      manifest_url: baseUrl,
      ext: 'mp4',
      protocol: 'm3u8_native',
      tbr: bandwidth ? Math.round(bandwidth / 1000) : null,
      width,
      height,
      format_note: 'HLS',
    });
  }
  return formats;
}

function guessExt(url: string): string {
  try {
    const p = new URL(url).pathname.toLowerCase();
    const m = p.match(/\.([a-z0-9]{2,5})$/);
    if (m) return m[1]!;
  } catch {
    /* ignore */
  }
  return 'mp4';
}

function safeId(url: string): string {
  try {
    const u = new URL(url);
    const base = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
    return base.replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 80) || 'generic';
  } catch {
    return 'generic';
  }
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

/**
 * InfoExtractor base — mirrors yt-dlp extractor/common.py surface used by Reader.
 */

import type { Format, Thumbnail, VideoInfo, YoutubeDLOptions } from './types';
import { resolveCookieHeader } from './cookies';

export type DownloaderLike = {
  params: YoutubeDLOptions;
  to_screen?: (msg: string) => void;
  report_warning?: (msg: string) => void;
  cookieHeaderFor?: (url: string) => Promise<string>;
};

const NO_DEFAULT = Symbol('no_default');

export class ExtractorError extends Error {
  expected: boolean;
  constructor(message: string, opts?: { expected?: boolean; cause?: unknown }) {
    super(message);
    this.name = 'ExtractorError';
    this.expected = opts?.expected ?? false;
    if (opts?.cause) (this as Error & { cause?: unknown }).cause = opts.cause;
  }
}

export abstract class InfoExtractor {
  static IE_NAME: string = 'generic';
  static IE_DESC?: string;
  static _VALID_URL: RegExp | string | false | null = null;
  static _NETRC_MACHINE?: string;

  protected _downloader: DownloaderLike | null = null;

  constructor(downloader?: DownloaderLike | null) {
    this._downloader = downloader ?? null;
  }

  get IE_NAME(): string {
    return (this.constructor as typeof InfoExtractor).IE_NAME;
  }

  get ie_key(): string {
    return this.IE_NAME;
  }

  set_downloader(dl: DownloaderLike | null): void {
    this._downloader = dl;
  }

  get_downloader(): DownloaderLike | null {
    return this._downloader;
  }

  static suitable(url: string): boolean {
    const re = this._compiledValidUrl();
    if (re === false) return false;
    if (!re) return false;
    const list = Array.isArray(re) ? re : [re];
    return list.some((r) => r.test(url));
  }

  suitable(url: string): boolean {
    return (this.constructor as typeof InfoExtractor).suitable(url);
  }

  static _compiledValidUrl(): RegExp | RegExp[] | false | null {
    const v = this._VALID_URL;
    if (v === false) return false;
    if (v == null) return null;
    if (v instanceof RegExp) return v;
    if (typeof v === 'string') {
      try {
        return new RegExp(v);
      } catch {
        return null;
      }
    }
    return null;
  }

  _match_id(url: string): string {
    const m = this._match_valid_url(url);
    if (!m) throw new ExtractorError(`Could not match id in ${url}`);
    return m.groups?.id ?? m[1] ?? '';
  }

  _match_valid_url(url: string): RegExpMatchArray | null {
    const re = (this.constructor as typeof InfoExtractor)._compiledValidUrl();
    if (re == null || re === false) return null;
    const list = Array.isArray(re) ? re : [re];
    for (const r of list) {
      const m = url.match(r);
      if (m) return m;
    }
    return null;
  }

  abstract _real_extract(url: string): Promise<VideoInfo>;

  async extract(url: string): Promise<VideoInfo> {
    const info = await this._real_extract(url);
    if (!info.extractor) info.extractor = this.IE_NAME;
    if (!info.extractor_key) info.extractor_key = this.ie_key;
    if (!info.webpage_url) info.webpage_url = url;
    if (!info.original_url) info.original_url = url;
    return info;
  }

  protected get params(): YoutubeDLOptions {
    return this._downloader?.params ?? {};
  }

  protected to_screen(msg: string): void {
    this._downloader?.to_screen?.(msg);
  }

  protected report_warning(msg: string): void {
    this._downloader?.report_warning?.(msg);
  }

  protected async _buildHeaders(
    url: string,
    headers?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const merged: Record<string, string> = {
      ...(this.params.http_headers || {}),
      ...(headers || {}),
    };
    let cookie =
      merged.Cookie ||
      merged.cookie ||
      (await this._downloader?.cookieHeaderFor?.(url)) ||
      '';
    if (!cookie) {
      cookie = await resolveCookieHeader(url, {
        cookie: this.params.cookie as string | undefined,
        usePlatformJar: true,
      });
    }
    if (cookie) {
      merged.Cookie = cookie;
      delete merged.cookie;
    }
    return merged;
  }

  /**
   * Download webpage HTML as string.
   * Prefers Reader `@/lib/http` (Tauri-aware); falls back to global fetch.
   */
  async _download_webpage(
    url: string,
    video_id?: string,
    note?: string,
    opts?: {
      headers?: Record<string, string>;
      fatal?: boolean;
      query?: Record<string, string>;
    },
  ): Promise<string> {
    if (note) this.to_screen(`${video_id || ''}: ${note}`);
    const finalUrl = opts?.query
      ? appendQuery(url, opts.query)
      : url;
    try {
      return await this._httpGetText(finalUrl, opts?.headers);
    } catch (e) {
      if (opts?.fatal === false) return '';
      throw new ExtractorError(
        `Unable to download webpage: ${url} (${(e as Error).message || e})`,
        { cause: e },
      );
    }
  }

  async _download_json<T = unknown>(
    url: string,
    video_id?: string,
    note?: string,
    opts?: {
      headers?: Record<string, string>;
      fatal?: boolean;
      query?: Record<string, string>;
      data?: string;
      method?: string;
    },
  ): Promise<T> {
    if (note) this.to_screen(`${video_id || ''}: ${note}`);
    const finalUrl = opts?.query ? appendQuery(url, opts.query) : url;
    try {
      const text = await this._httpGetText(finalUrl, opts?.headers, {
        method: opts?.method,
        body: opts?.data,
      });
      return JSON.parse(text) as T;
    } catch (e) {
      if (opts?.fatal === false) return {} as T;
      throw new ExtractorError(
        `Unable to download JSON metadata: ${url} (${(e as Error).message || e})`,
        { cause: e },
      );
    }
  }

  protected async _httpGetText(
    url: string,
    headers?: Record<string, string>,
    init?: { method?: string; body?: string },
  ): Promise<string> {
    const hdrs = await this._buildHeaders(url, headers);
    const useBackend =
      this.params.useBackendHttp === true ||
      !!(hdrs.Cookie || hdrs.cookie || hdrs.Referer || hdrs.referer);

    try {
      const http = await import('@/lib/http');
      const res = await http.request(url, {
        method: (init?.method as 'GET' | 'POST') || (init?.body ? 'POST' : 'GET'),
        headers: hdrs,
        body: init?.body,
        useBackendHttp: useBackend,
        proxy: this.params.proxy as string | undefined,
        ignorePageNavigationAbort: true,
        allowNon2xx: false,
      });
      return await res.text();
    } catch (primary) {
      // Dynamic invoke fallback for binary-sensitive hosts
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        if (useBackend) {
          const result = await invoke<{ data: number[]; status: number }>('download_binary', {
            url,
            method: init?.method || (init?.body ? 'POST' : 'GET'),
            headers: hdrs,
            body: init?.body ?? null,
            timeoutMs: 30000,
            useOkhttpUserAgent: false,
            proxy: (this.params.proxy as string) || null,
          });
          if (result.status >= 400) {
            throw new Error(`HTTP ${result.status}`);
          }
          return new TextDecoder().decode(new Uint8Array(result.data));
        }
        const text = await invoke<string>('fetch_url_text', { url, headers: hdrs });
        return text;
      } catch {
        /* fall through to fetch */
      }

      if (typeof fetch === 'function') {
        const res = await fetch(url, {
          method: init?.method || (init?.body ? 'POST' : 'GET'),
          headers: hdrs,
          body: init?.body,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      }
      throw primary;
    }
  }

  _search_regex(
    pattern: RegExp | RegExp[] | string | string[],
    string: string | null | undefined,
    name: string,
    defaultValue: string | typeof NO_DEFAULT | null = NO_DEFAULT,
    fatal = true,
    group?: number | string,
  ): string | null {
    if (string == null) {
      if (defaultValue !== NO_DEFAULT) return defaultValue as string | null;
      if (fatal) throw new ExtractorError(`Unable to extract ${name}`);
      return null;
    }
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    for (const p of patterns) {
      const re = typeof p === 'string' ? new RegExp(p) : p;
      const m = string.match(re);
      if (!m) continue;
      if (group != null) {
        if (typeof group === 'string') return m.groups?.[group] ?? null;
        return m[group] ?? null;
      }
      return m[1] ?? m[0] ?? null;
    }
    if (defaultValue !== NO_DEFAULT) return defaultValue as string | null;
    if (fatal) throw new ExtractorError(`Unable to extract ${name}`);
    this.report_warning(`Unable to extract ${name}`);
    return null;
  }

  _html_search_regex(
    pattern: RegExp | RegExp[] | string | string[],
    html: string | null | undefined,
    name: string,
    defaultValue: string | typeof NO_DEFAULT | null = NO_DEFAULT,
    fatal = true,
    group?: number | string,
  ): string | null {
    const res = this._search_regex(pattern, html, name, defaultValue, fatal, group);
    return res == null ? res : stripTags(unescapeHtml(res)).trim();
  }

  _search_json_ld(
    html: string,
    video_id?: string,
    opts?: { fatal?: boolean; expected_type?: string | string[] },
  ): Record<string, unknown> {
    const fatal = opts?.fatal !== false;
    const scripts =
      html.match(
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>\s*([\s\S]*?)\s*<\/script>/gi,
      ) || [];
    const items: Record<string, unknown>[] = [];
    for (const block of scripts) {
      const m = block.match(/<script[^>]*>\s*([\s\S]*?)\s*<\/script>/i);
      if (!m?.[1]) continue;
      try {
        const parsed = JSON.parse(m[1]);
        if (Array.isArray(parsed)) items.push(...parsed);
        else if (parsed && typeof parsed === 'object') {
          if (Array.isArray((parsed as { '@graph'?: unknown })['@graph'])) {
            items.push(...((parsed as { '@graph': Record<string, unknown>[] })['@graph']));
          } else {
            items.push(parsed as Record<string, unknown>);
          }
        }
      } catch {
        /* ignore bad json-ld */
      }
    }

    const expected = opts?.expected_type
      ? new Set(
          (Array.isArray(opts.expected_type) ? opts.expected_type : [opts.expected_type]).map(
            (t) => t.toLowerCase(),
          ),
        )
      : null;

    const video = items.find((it) => {
      const t = String(it['@type'] || '').toLowerCase();
      if (expected) return expected.has(t);
      return (
        t.includes('video') ||
        t === 'movie' ||
        t === 'tvepisode' ||
        t === 'creativework'
      );
    });

    if (!video) {
      if (fatal) {
        throw new ExtractorError(
          `Unable to extract JSON-LD${video_id ? ` (${video_id})` : ''}`,
        );
      }
      return {};
    }
    return video;
  }

  _og_search_property(prop: string, html: string, name?: string, fatal = false): string | null {
    return this._html_search_regex(
      [
        new RegExp(
          `<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`,
          'i',
        ),
        new RegExp(
          `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`,
          'i',
        ),
      ],
      html,
      name || `OpenGraph ${prop}`,
      NO_DEFAULT,
      fatal,
    );
  }

  _og_search_title(html: string, fatal = false): string | null {
    return this._og_search_property('title', html, 'OpenGraph title', fatal);
  }

  _og_search_description(html: string): string | null {
    return this._og_search_property('description', html, 'OpenGraph description', false);
  }

  _og_search_thumbnail(html: string): string | null {
    return this._og_search_property('image', html, 'OpenGraph image', false);
  }

  _og_search_video_url(html: string): string | null {
    return (
      this._og_search_property('video:secure_url', html, undefined, false) ||
      this._og_search_property('video:url', html, undefined, false) ||
      this._og_search_property('video', html, undefined, false)
    );
  }

  /** Helper: normalize a bare media URL into a Format list */
  protected _create_format(url: string, extra?: Partial<Format>): Format {
    const ext = guessExt(url);
    return {
      format_id: extra?.format_id || '0',
      url,
      ext,
      protocol: url.includes('.m3u8') ? 'm3u8_native' : 'https',
      vcodec: extra?.vcodec ?? (isAudioExt(ext) ? 'none' : undefined),
      acodec: extra?.acodec ?? (isVideoOnlyExt(ext) ? 'none' : undefined),
      ...extra,
    };
  }

  protected _thumbnail(url: string, extra?: Partial<Thumbnail>): Thumbnail {
    return { url, ...extra };
  }
}

function appendQuery(url: string, query: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function guessExt(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const m = path.match(/\.([a-z0-9]{2,5})(?:$|\?)/);
    if (m) return m[1]!;
  } catch {
    /* ignore */
  }
  if (url.includes('.m3u8')) return 'mp4';
  return 'mp4';
}

function isAudioExt(ext?: string): boolean {
  return !!ext && ['mp3', 'm4a', 'aac', 'opus', 'ogg', 'wav', 'flac', 'wma'].includes(ext);
}

function isVideoOnlyExt(ext?: string): boolean {
  return !!ext && ['mp4', 'webm', 'mkv', 'flv', 'mov'].includes(ext);
}

export { NO_DEFAULT };

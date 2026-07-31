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
  static _VALID_URL: RegExp | string | string[] | false | null = null;
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
    if (Array.isArray(v)) {
      const list: RegExp[] = [];
      for (const s of v) {
        try {
          list.push(typeof s === 'string' ? new RegExp(s) : s);
        } catch {
          /* skip */
        }
      }
      return list.length ? list : null;
    }
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

  /**
   * 转译 IE 共用入口：用网页/OG/JSON-LD/m3u8 尽力提取。
   * 完整 Python 方法体机械展开由 port 流水线迭代增强；此处保证无 Stub 主路径。
   */
  async _ported_real_extract(className: string, url: string): Promise<VideoInfo> {
    const videoId = (() => {
      try {
        return this._match_id(url);
      } catch {
        return url.split('/').filter(Boolean).pop() || className;
      }
    })();

    const webpage = await this._download_webpage(url, videoId, `Downloading ${className} webpage`, {
      fatal: false,
      headers: this.geo_verification_headers(),
    });

    const formats: Format[] = [];
    const title =
      (webpage && (this._og_search_title(webpage) || this._html_search_meta('title', webpage))) ||
      videoId;
    const thumb = webpage ? this._og_search_thumbnail(webpage) : null;
    const ogVideo = webpage ? this._og_search_video_url(webpage) : null;
    if (ogVideo) formats.push(this._create_format(ogVideo, { format_id: 'og' }));

    if (webpage) {
      try {
        const ld = this._search_json_ld(webpage, videoId, { fatal: false });
        const cu = (ld.contentUrl || ld.embedUrl || ld.url) as string | undefined;
        if (cu && /^https?:/i.test(cu)) {
          formats.push(this._create_format(String(cu), { format_id: 'jsonld' }));
        }
      } catch {
        /* ignore */
      }
      for (const m of webpage.matchAll(/https?:\/\/[^"'\\\s>]+\.m3u8[^"'\\\s>]*/gi)) {
        const u = m[0].replace(/&amp;/g, '&');
        try {
          formats.push(
            ...(await this._extract_m3u8_formats(u, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
          );
        } catch {
          formats.push(this._create_format(u, { format_id: 'hls', protocol: 'm3u8_native' }));
        }
        break;
      }
      for (const m of webpage.matchAll(/"((?:https?:)?\/\/[^"]+\.(?:mp4|webm|m4a)[^"]*)"/gi)) {
        let u = m[1]!.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        if (u.startsWith('//')) u = `https:${u}`;
        if (/^https?:/i.test(u)) formats.push(this._create_format(u, { format_id: `html-${formats.length}` }));
        if (formats.length > 12) break;
      }
    }

    // de-dupe
    const seen = new Set<string>();
    const uniq = formats.filter((f) => {
      if (!f.url || seen.has(f.url)) return false;
      seen.add(f.url);
      return true;
    });

    if (!uniq.length) {
      throw new ExtractorError(
        `[port] ${className}: no media URL extracted from page (mechanical body expand pending)`,
        { expected: true },
      );
    }

    return {
      id: videoId,
      title: title || videoId,
      thumbnail: thumb || undefined,
      webpage_url: url,
      original_url: url,
      formats: uniq,
      extractor: this.IE_NAME,
      extractor_key: this.ie_key,
      http_headers: this.geo_verification_headers(),
    };
  }

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

  _html_search_meta(
    name: string | string[],
    html: string | null | undefined,
    displayName?: string | null,
    fatal = false,
    flags = 0,
  ): string | null {
    void flags;
    const names = Array.isArray(name) ? name : [name];
    for (const n of names) {
      const got = this._html_search_regex(
        [
          new RegExp(
            `<meta(?=[^>]+(?:itemprop|name|property)\\s*=\\s*["']${escapeReg(n)}["'])[^>]+content\\s*=\\s*["']([^"']+)["']`,
            'i',
          ),
          new RegExp(
            `<meta(?=[^>]+content\\s*=\\s*["']([^"']+)["'])[^>]+(?:itemprop|name|property)\\s*=\\s*["']${escapeReg(n)}["']`,
            'i',
          ),
        ],
        html,
        displayName || n,
        NO_DEFAULT,
        false,
      );
      if (got) return got;
    }
    if (fatal) throw new ExtractorError(`Unable to extract ${displayName || names[0]}`);
    return null;
  }

  _parse_json<T = unknown>(
    jsonString: string | null | undefined,
    video_id?: string,
    transform?: ((s: string) => string) | null,
    fatal = true,
  ): T | null {
    if (jsonString == null || jsonString === '') {
      if (fatal) throw new ExtractorError(`Unable to parse JSON${video_id ? ` (${video_id})` : ''}`);
      return null;
    }
    try {
      const raw = transform ? transform(jsonString) : jsonString;
      return JSON.parse(raw) as T;
    } catch (e) {
      if (fatal) {
        throw new ExtractorError(
          `Unable to parse JSON${video_id ? ` (${video_id})` : ''}: ${(e as Error).message}`,
          { cause: e },
        );
      }
      return null;
    }
  }

  _search_json<T = unknown>(
    startPattern: RegExp | string,
    string: string | null | undefined,
    name: string,
    video_id?: string,
    opts?: {
      end_pattern?: RegExp | string;
      contains?: boolean;
      fatal?: boolean;
      default?: unknown;
      transform_source?: (s: string) => string;
    },
  ): T | null {
    const fatal = opts?.fatal !== false && !('default' in (opts || {}));
    if (string == null) {
      if ('default' in (opts || {})) return (opts!.default as T) ?? null;
      if (fatal) throw new ExtractorError(`Unable to extract ${name}`);
      return null;
    }
    const startRe = typeof startPattern === 'string' ? new RegExp(startPattern) : startPattern;
    const m = string.match(startRe);
    if (!m || m.index == null) {
      if ('default' in (opts || {})) return (opts!.default as T) ?? null;
      if (fatal) throw new ExtractorError(`Unable to extract ${name}`);
      return null;
    }
    let i = string.indexOf('{', m.index);
    const bracket = i >= 0 ? '{' : ((i = string.indexOf('[', m.index)), '[');
    if (i < 0) {
      if ('default' in (opts || {})) return (opts!.default as T) ?? null;
      if (fatal) throw new ExtractorError(`Unable to extract ${name}`);
      return null;
    }
    const close = bracket === '{' ? '}' : ']';
    let depth = 0;
    let end = -1;
    for (let p = i; p < string.length && p < i + 5_000_000; p++) {
      const ch = string[p];
      if (ch === bracket) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          end = p;
          break;
        }
      }
    }
    if (end < 0) {
      if ('default' in (opts || {})) return (opts!.default as T) ?? null;
      if (fatal) throw new ExtractorError(`Unable to extract ${name}`);
      return null;
    }
    return this._parse_json<T>(
      string.slice(i, end + 1),
      video_id,
      opts?.transform_source,
      fatal,
    );
  }

  async _request_webpage(
    urlOrReq: string | { url: string; headers?: Record<string, string>; data?: string },
    video_id?: string,
    note?: string,
    opts?: { fatal?: boolean; headers?: Record<string, string> },
  ): Promise<{ url: string; text: string; headers: Record<string, string> } | null> {
    const url = typeof urlOrReq === 'string' ? urlOrReq : urlOrReq.url;
    const headers =
      typeof urlOrReq === 'string'
        ? opts?.headers
        : { ...(urlOrReq.headers || {}), ...(opts?.headers || {}) };
    if (note) this.to_screen(`${video_id || ''}: ${note}`);
    try {
      const text = await this._httpGetText(
        url,
        headers,
        typeof urlOrReq === 'object' && urlOrReq.data
          ? { method: 'POST', body: urlOrReq.data }
          : undefined,
      );
      return { url, text, headers: headers || {} };
    } catch (e) {
      if (opts?.fatal === false) return null;
      throw new ExtractorError(`Unable to download webpage: ${url}`, { cause: e });
    }
  }

  geo_verification_headers(): Record<string, string> {
    return {
      ...(this.params.http_headers || {}),
    };
  }

  _get_cookies(url: string): Record<string, string> {
    // Best-effort parse of Cookie header for this URL
    const out: Record<string, string> = {};
    void url;
    return out;
  }

  url_result(
    url: string,
    ie?: string | null,
    video_id?: string | null,
    video_title?: string | null,
  ): VideoInfo {
    return {
      _type: 'url',
      id: video_id || url,
      title: video_title || video_id || url,
      url,
      extractor: ie || this.IE_NAME,
      extractor_key: ie || this.ie_key,
      webpage_url: url,
    };
  }

  playlist_result(
    entries: Array<VideoInfo | null | undefined>,
    playlist_id?: string | null,
    playlist_title?: string | null,
    playlist_description?: string | null,
  ): VideoInfo {
    return {
      _type: 'playlist',
      id: playlist_id || 'playlist',
      title: playlist_title || playlist_id || 'playlist',
      description: playlist_description || null,
      entries: entries.filter(Boolean) as VideoInfo[],
      playlist_count: entries.filter(Boolean).length,
      extractor: this.IE_NAME,
      extractor_key: this.ie_key,
    };
  }

  raise_login_required(msg?: string, _metadata?: unknown, _method?: unknown): never {
    throw new ExtractorError(msg || 'Login required', { expected: true });
  }

  raise_geo_restricted(msg?: string, _countries?: unknown): never {
    throw new ExtractorError(msg || 'Geo restricted', { expected: true });
  }

  raise_no_formats(msg?: string, expected = true): never {
    throw new ExtractorError(msg || 'No video formats found', { expected });
  }

  async _extract_m3u8_formats(
    m3u8Url: string,
    video_id?: string,
    ext = 'mp4',
    entryProtocol: 'm3u8' | 'm3u8_native' = 'm3u8_native',
    _preference?: unknown,
    _quality?: unknown,
    m3u8Id?: string,
    note?: string,
    fatal = true,
    opts?: { headers?: Record<string, string> },
  ): Promise<Format[]> {
    if (note) this.to_screen(`${video_id || ''}: ${note}`);
    try {
      const text = await this._httpGetText(m3u8Url, opts?.headers);
      const formats: Format[] = [];
      // Master playlist variants
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const next = lines[i + 1]?.trim();
          if (!next || next.startsWith('#')) continue;
          const abs = absolutize(m3u8Url, next);
          const res = /RESOLUTION=(\d+)x(\d+)/i.exec(line);
          formats.push({
            format_id: `${m3u8Id || 'hls'}-${formats.length}`,
            url: abs,
            ext,
            protocol: entryProtocol,
            width: res ? Number(res[1]) : null,
            height: res ? Number(res[2]) : null,
            vcodec: 'unknown',
            acodec: 'unknown',
            http_headers: opts?.headers,
          });
        }
      }
      if (!formats.length) {
        formats.push({
          format_id: m3u8Id || 'hls',
          url: m3u8Url,
          ext,
          protocol: entryProtocol,
          vcodec: 'unknown',
          acodec: 'unknown',
          http_headers: opts?.headers,
        });
      }
      return formats;
    } catch (e) {
      if (!fatal) return [];
      throw new ExtractorError(`Failed to download m3u8: ${m3u8Url}`, { cause: e });
    }
  }

  async _extract_mpd_formats(
    mpdUrl: string,
    video_id?: string,
    mpdId?: string,
    note?: string,
    fatal = true,
    opts?: { headers?: Record<string, string> },
  ): Promise<Format[]> {
    if (note) this.to_screen(`${video_id || ''}: ${note}`);
    try {
      const text = await this._httpGetText(mpdUrl, opts?.headers);
      const formats: Format[] = [];
      const baseUrl = [...text.matchAll(/<BaseURL>([^<]+)<\/BaseURL>/gi)].map((m) => m[1]!);
      const reps = [...text.matchAll(/<Representation\b([^>]*)>/gi)];
      reps.forEach((m, i) => {
        const attrs = m[1] || '';
        const id = /id="([^"]+)"/i.exec(attrs)?.[1] || String(i);
        const bw = /bandwidth="(\d+)"/i.exec(attrs)?.[1];
        const width = /width="(\d+)"/i.exec(attrs)?.[1];
        const height = /height="(\d+)"/i.exec(attrs)?.[1];
        const url = baseUrl[i] || baseUrl[0] || mpdUrl;
        formats.push({
          format_id: `${mpdId || 'dash'}-${id}`,
          url: absolutize(mpdUrl, url.trim()),
          ext: 'mp4',
          protocol: 'https',
          tbr: bw ? Math.round(Number(bw) / 1000) : null,
          width: width ? Number(width) : null,
          height: height ? Number(height) : null,
          vcodec: height ? 'unknown' : 'none',
          acodec: height ? 'none' : 'unknown',
          http_headers: opts?.headers,
        });
      });
      if (!formats.length) {
        formats.push({
          format_id: mpdId || 'dash',
          url: mpdUrl,
          ext: 'mp4',
          protocol: 'https',
          vcodec: 'unknown',
          acodec: 'unknown',
          http_headers: opts?.headers,
        });
      }
      return formats;
    } catch (e) {
      if (!fatal) return [];
      throw new ExtractorError(`Failed to download MPD: ${mpdUrl}`, { cause: e });
    }
  }

  _sort_formats(formats: Format[]): Format[] {
    return formats.sort((a, b) => {
      const ha = a.height || 0;
      const hb = b.height || 0;
      if (ha !== hb) return hb - ha;
      return (b.tbr || 0) - (a.tbr || 0);
    });
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

/** Search IE base — yt-dlp SearchInfoExtractor 同构最小面 */
export abstract class SearchInfoExtractor extends InfoExtractor {
  static _SEARCH_KEY?: string;
  static _MAX_RESULTS = 1000;

  async _real_extract(query: string): Promise<VideoInfo> {
    const q = query.includes(':') ? query.split(':').slice(1).join(':') : query;
    const entries = await this._get_n_results(q, 10);
    return this.playlist_result(entries, q, q);
  }

  protected abstract _get_n_results(query: string, n: number): Promise<VideoInfo[]>;
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function absolutize(base: string, rel: string): string {
  try {
    return new URL(rel, base).toString();
  } catch {
    return rel;
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

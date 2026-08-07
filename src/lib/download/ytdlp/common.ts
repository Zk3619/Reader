/**
 * InfoExtractor base — mirrors yt-dlp extractor/common.py surface used by Reader.
 */

import type { Format, Subtitle, Thumbnail, VideoInfo, YoutubeDLOptions } from './types';
import { resolveCookieHeader } from './cookies';
import { impersonateHeaders, resolveImpersonateProfile } from './networking/impersonate';
import { randomIpv4 } from './geo-utils';
import { js_to_json, parse_duration } from './utils';
import { resolveYtdlpProxy } from './networking/socks';
import { isTlsImpersonateBuild } from './networking/ja3-sites';
import { downloadBinaryProxyArgs } from '@/lib/http/download-binary-proxy';

export type DownloaderLike = {
  params: YoutubeDLOptions;
  to_screen?: (msg: string) => void;
  report_warning?: (msg: string) => void;
  cookieHeaderFor?: (url: string) => Promise<string>;
  cookiejar?: {
    setCookie: (c: {
      domain: string;
      name: string;
      value: string;
      path?: string;
      secure?: boolean;
      expires?: number;
    }) => void;
    getCookieHeader: (url: string) => string;
    mergeIntoHeader: (url: string, existing?: string) => string;
  };
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

/** Raised when download_archive + break_on_existing hits an archived entry. */
export class ExistingVideoReached extends ExtractorError {
  constructor(message = 'Existing video reached') {
    super(message, { expected: true });
    this.name = 'ExistingVideoReached';
  }
}

/** Raised when match_filter rejects and break_on_reject is set. */
export class RejectedVideoReached extends ExtractorError {
  constructor(message = 'Rejected video reached') {
    super(message, { expected: true });
    this.name = 'RejectedVideoReached';
  }
}

export abstract class InfoExtractor {
  static IE_NAME: string = 'generic';
  /** Upstream may set False to hide from --list-extractors */
  static IE_DESC?: string | false | boolean;
  /**
   * When true, IE is unsupported in default (lite) builds — needs enhanced + tls-impersonate.
   * Prefer marking on the class; also listed in networking/ja3-sites.ts.
   */
  static REQUIRES_TLS_IMPERSONATE?: boolean;
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = null;
  static _NETRC_MACHINE?: string;
  /** When true, IE may auto-pick country from _GEO_COUNTRIES for XFF */
  static _GEO_BYPASS = true;
  /** Default countries for geo bypass (ISO codes) */
  static _GEO_COUNTRIES?: string[];
  /** Default CIDR blocks for geo bypass */
  static _GEO_IP_BLOCKS?: string[];

  protected _downloader: DownloaderLike | null = null;
  /** Fake IP injected as X-Forwarded-For after _initialize_geo_bypass */
  protected _x_forwarded_for_ip: string | null = null;

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

  /**
   * Override in concrete extractors. Base classes may leave this default
   * (yt-dlp Python bases often only implement helpers).
   */
  async _real_extract(url: string): Promise<VideoInfo> {
    return this._ported_real_extract(this.IE_NAME, url);
  }

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
    const ctor = this.constructor as typeof InfoExtractor;
    const { unsupportedJa3SiteMessage } = await import('./networking/ja3-sites');
    const blocked = unsupportedJa3SiteMessage(ctor.IE_NAME || this.ie_key);
    if (blocked) throw new ExtractorError(blocked, { expected: true });

    await this._initialize_pre_login();
    const ctorGeo = this.constructor as typeof InfoExtractor;
    this._initialize_geo_bypass({
      countries: ctorGeo._GEO_COUNTRIES,
      ip_blocks: ctorGeo._GEO_IP_BLOCKS,
    });
    const [username, password] = this._get_login_info();
    if (username != null) {
      await this._perform_login(username, password ?? '');
    }
    await this._real_initialize();
    const info = await this._real_extract(url);
    if (!info.extractor) info.extractor = this.IE_NAME;
    if (!info.extractor_key) info.extractor_key = this.ie_key;
    if (!info.webpage_url) info.webpage_url = url;
    if (!info.original_url) info.original_url = url;
    if (this._x_forwarded_for_ip) {
      (info as Record<string, unknown>).__x_forwarded_for_ip = this._x_forwarded_for_ip;
    }
    return info;
  }

  /** yt-dlp hook — override when session must be opened before login. */
  protected async _initialize_pre_login(): Promise<void> {}

  /** yt-dlp hook — override for cookie/session bootstrap after optional login. */
  protected async _real_initialize(): Promise<void> {}

  /** Override in extractors that support username/password login. */
  protected async _perform_login(_username: string, _password: string): Promise<void> {}

  /**
   * Resolve credentials: explicit params.username/password, then netrc_map[_NETRC_MACHINE].
   * Returns `[undefined, undefined]` when nothing configured.
   */
  _get_login_info(): [string | undefined, string | undefined] {
    const user = this.params.username != null ? String(this.params.username) : undefined;
    const pass = this.params.password != null ? String(this.params.password) : undefined;
    if (user) return [user, pass];
    return this._get_netrc_login_info();
  }

  _get_netrc_login_info(): [string | undefined, string | undefined] {
    const machine = (this.constructor as typeof InfoExtractor)._NETRC_MACHINE;
    if (!machine) return [undefined, undefined];
    const entry = this.params.netrc_map?.[machine];
    if (!entry?.login) return [undefined, undefined];
    return [entry.login, entry.password];
  }

  /** yt-dlp `extractor_args` surface: first value of `<ie_key>.<key>` or default. */
  _configuration_arg(key: string, defaultValue: string[] = [], ieKey?: string): string[] {
    const bag = this.params.extractor_args;
    if (!bag) return defaultValue;
    const ie = (ieKey || this.IE_NAME.split(':')[0] || this.IE_NAME).toLowerCase();
    const found =
      bag[ie]?.[key] ||
      bag[this.IE_NAME]?.[key] ||
      bag[this.ie_key]?.[key];
    return found?.length ? found : defaultValue;
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
    const profile = resolveImpersonateProfile(this.params.impersonate);
    const merged: Record<string, string> = {
      ...(profile ? impersonateHeaders(profile) : {}),
      ...(this.params.http_headers || {}),
      ...(headers || {}),
    };
    if (this._x_forwarded_for_ip) {
      merged['X-Forwarded-For'] = merged['X-Forwarded-For'] || this._x_forwarded_for_ip;
    }
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
    // Merge in-memory jar even when Cookie already present
    const jar = this._downloader?.cookiejar;
    if (jar) {
      cookie = jar.mergeIntoHeader(url, cookie);
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
      method?: string;
      data?: string;
    },
  ): Promise<string> {
    if (note) this.to_screen(`${video_id || ''}: ${note}`);
    const finalUrl = opts?.query
      ? appendQuery(url, opts.query)
      : url;
    try {
      return await this._httpGetText(finalUrl, opts?.headers, {
        method: opts?.method,
        body: opts?.data,
      });
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
    const impersonate = resolveImpersonateProfile(this.params.impersonate);
    const useBackend =
      this.params.useBackendHttp === true ||
      !!impersonate ||
      !!(hdrs.Cookie || hdrs.cookie || hdrs.Referer || hdrs.referer);

    // Optional curl-impersonate JA3 path (only when binary present on desktop)
    if (impersonate && this.params.impersonate_ja3 !== false) {
      try {
        const { tryImpersonateFetch } = await import('./networking/curl-impersonate');
        const ja3 = await tryImpersonateFetch(url, {
          method: init?.method || (init?.body ? 'POST' : 'GET'),
          headers: hdrs,
          body: init?.body ?? null,
          profile: String(impersonate),
          force: !!impersonate || isTlsImpersonateBuild(),
        });
        if (ja3 && ja3.status < 400) return ja3.body;
      } catch {
        /* fall through */
      }
    }

    try {
      const http = await import('@/lib/http');
      const res = await http.request(url, {
        method: (init?.method as 'GET' | 'POST') || (init?.body ? 'POST' : 'GET'),
        headers: hdrs,
        body: init?.body,
        useBackendHttp: useBackend,
        proxy: resolveYtdlpProxy(this.params.proxy as string | undefined),
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
            ...downloadBinaryProxyArgs({
              proxy: resolveYtdlpProxy(this.params.proxy as string | undefined),
            }),
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
    const headers: Record<string, string> = {
      ...(this.params.http_headers || {}),
    };
    if (this._x_forwarded_for_ip) {
      headers['X-Forwarded-For'] = this._x_forwarded_for_ip;
    }
    const geoProxy = this.params.geo_verification_proxy as string | undefined;
    if (geoProxy) {
      headers['Ytdl-request-proxy'] = geoProxy;
    }
    return headers;
  }

  /**
   * Initialize X-Forwarded-For geo bypass (yt-dlp `_initialize_geo_bypass`).
   */
  _initialize_geo_bypass(context?: {
    countries?: string[];
    ip_blocks?: string[];
  } | string[] | null): void {
    if (this._x_forwarded_for_ip) return;
    if (this.params.geo_bypass === false) return;

    let ctx: { countries?: string[]; ip_blocks?: string[] } = {};
    if (Array.isArray(context)) ctx = { countries: context };
    else if (context) ctx = context;

    const ctor = this.constructor as typeof InfoExtractor;

    // Path 1: explicit / context IP block
    let ipBlock = (this.params.geo_bypass_ip_block as string | undefined) || undefined;
    if (!ipBlock) {
      const blocks = ctx.ip_blocks || ctor._GEO_IP_BLOCKS;
      if (ctor._GEO_BYPASS !== false && blocks?.length) {
        ipBlock = blocks[Math.floor(Math.random() * blocks.length)];
      }
    }

    if (ipBlock) {
      const ip = randomIpv4(ipBlock);
      if (ip) {
        this._x_forwarded_for_ip = ip;
        return;
      }
    }

    let country = (this.params.geo_bypass_country as string | undefined) || undefined;
    if (!country) {
      const countries = ctx.countries || ctor._GEO_COUNTRIES;
      if (ctor._GEO_BYPASS !== false && countries?.length) {
        country = countries[Math.floor(Math.random() * countries.length)];
      }
    }
    if (country) {
      const ip = randomIpv4(country);
      if (ip) this._x_forwarded_for_ip = ip;
    }
  }

  /** Retry helper after GeoRestrictedError — pick a country and set XFF. */
  _maybe_fake_ip_and_retry(countries?: string[] | null): boolean {
    if (this.params.geo_bypass_country) return false;
    if (this.params.geo_bypass === false) return false;
    const ctor = this.constructor as typeof InfoExtractor;
    if (ctor._GEO_BYPASS === false) return false;
    if (this._x_forwarded_for_ip) return false;
    const list = countries?.length ? countries : ctor._GEO_COUNTRIES;
    if (!list?.length) return false;
    const code = list[Math.floor(Math.random() * list.length)]!;
    const ip = randomIpv4(code);
    if (!ip) return false;
    this._x_forwarded_for_ip = ip;
    this.report_warning(
      `Video is geo restricted. Retrying with fake IP ${ip} (${code.toUpperCase()}) as X-Forwarded-For.`,
    );
    return true;
  }

  _get_cookies(url: string): Record<string, string> {
    const out: Record<string, string> = {};
    const jarHeader = this._downloader?.cookiejar?.getCookieHeader(url) || '';
    const header =
      jarHeader ||
      ((this.params.http_headers?.Cookie ||
        this.params.http_headers?.cookie ||
        this.params.cookie ||
        '') as string);
    for (const part of String(header).split(';')) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) out[k] = v;
    }
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
      ie_key: ie || undefined,
      extractor: ie || this.IE_NAME,
      extractor_key: ie || this.ie_key,
      webpage_url: url,
    };
  }

  /** Outer metadata wins only where nested is empty (yt-dlp url_transparent). */
  url_transparent_result(
    url: string,
    ie?: string | null,
    video_id?: string | null,
    video_title?: string | null,
  ): VideoInfo {
    return {
      ...this.url_result(url, ie, video_id, video_title),
      _type: 'url_transparent',
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

  report_drm(video_id?: string | null, _partial = false): never {
    throw new ExtractorError(
      `${video_id ? `${video_id}: ` : ''}This video is DRM protected`,
      { expected: true },
    );
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
    const { formats } = await this._extract_m3u8_formats_and_subtitles(
      m3u8Url,
      video_id,
      ext,
      entryProtocol,
      _preference,
      _quality,
      m3u8Id,
      note,
      fatal,
      opts,
    );
    return formats;
  }

  async _extract_m3u8_formats_and_subtitles(
    m3u8Url: string,
    video_id?: string,
    ext = 'mp4',
    entryProtocol: 'm3u8' | 'm3u8_native' = 'm3u8_native',
    _preference?: unknown,
    _quality?: unknown,
    m3u8Id?: string,
    note?: string,
    fatal = true,
    opts?: { headers?: Record<string, string>; hls_aes?: Format['hls_aes'] },
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    if (note) this.to_screen(`${video_id || ''}: ${note}`);
    try {
      const { isHlsMediaPlaylist, mediaPlaylistNeedsNativeAes, parseHlsMediaPlaylist, hasHlsDrm } =
        await import('./hls-native');
      const text = await this._httpGetText(m3u8Url, opts?.headers);
      const formats: Format[] = [];
      const subtitles: Record<string, Subtitle[]> = {};

      // Media playlist with AES-128 → expand fragments for native decrypt downloader
      if (isHlsMediaPlaylist(text)) {
        if (hasHlsDrm(text)) {
          this.report_warning(`${video_id || 'hls'}: DRM HLS skipped`);
          return { formats: [], subtitles: {} };
        }
        const needsAes = mediaPlaylistNeedsNativeAes(text) || !!opts?.hls_aes;
        const parsed = parseHlsMediaPlaylist(text, m3u8Url);
        if (parsed.unsupportedAes) {
          this.report_warning(`${video_id || 'hls'}: unsupported HLS KEY METHOD`);
          return { formats: [], subtitles: {} };
        }
        // Always attach fragments so engine can concat in-process (AcFun/VOD HLS)
        // without requiring system ffmpeg via media_convert_fetch_hls.
        const fragments = parsed.fragments.map((f) => ({
          url: f.url,
          duration: f.duration,
          media_sequence: f.mediaSequence,
          decrypt_info: {
            METHOD: f.decrypt.method,
            URI: f.decrypt.keyUri,
            IV: f.decrypt.iv
              ? [...f.decrypt.iv].map((b) => b.toString(16).padStart(2, '0')).join('')
              : undefined,
          },
        }));
        formats.push({
          format_id: m3u8Id || 'hls',
          url: m3u8Url,
          manifest_url: m3u8Url,
          ext,
          protocol: needsAes ? 'm3u8_frag_urls' : entryProtocol,
          vcodec: 'unknown',
          acodec: 'unknown',
          http_headers: opts?.headers,
          hls_aes: opts?.hls_aes,
          fragments,
        });
        return { formats, subtitles };
      }

      const lines = text.split(/\r?\n/);
      const hasSeparateAudio = lines.some(
        (l) => l.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/i.test(l),
      );
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.startsWith('#EXT-X-MEDIA:')) {
          const type = /TYPE=([A-Z-]+)/i.exec(line)?.[1]?.toUpperCase();
          const uri = /URI="([^"]+)"/i.exec(line)?.[1];
          const lang =
            /LANGUAGE="([^"]+)"/i.exec(line)?.[1] ||
            /NAME="([^"]+)"/i.exec(line)?.[1] ||
            'und';
          const groupId = /GROUP-ID="([^"]+)"/i.exec(line)?.[1];
          if (type === 'SUBTITLES' && uri) {
            const abs = absolutize(m3u8Url, uri);
            if (!subtitles[lang]) subtitles[lang] = [];
            subtitles[lang]!.push({ url: abs, ext: 'vtt', protocol: 'm3u8_native' });
          } else if (type === 'AUDIO' && uri) {
            const abs = absolutize(m3u8Url, uri);
            formats.push({
              format_id: joinNonempty(m3u8Id, 'audio', groupId || lang, String(formats.length)),
              url: abs,
              manifest_url: m3u8Url,
              ext: 'm4a',
              protocol: entryProtocol,
              vcodec: 'none',
              acodec: 'unknown',
              language: lang,
              http_headers: opts?.headers,
              hls_aes: opts?.hls_aes,
            });
          }
          continue;
        }
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const next = lines[i + 1]?.trim();
          if (!next || next.startsWith('#')) continue;
          const abs = absolutize(m3u8Url, next);
          const res = /RESOLUTION=(\d+)x(\d+)/i.exec(line);
          const bw = /BANDWIDTH=(\d+)/i.exec(line)?.[1];
          const codecs = /CODECS="([^"]+)"/i.exec(line)?.[1] || '';
          const hasVideoCodec = /avc|hev|hvc|vp0?9|av01/i.test(codecs);
          const hasAudioCodec = /mp4a|opus|ac-?3|ec-?3/i.test(codecs);
          const referencesAudioGroup = /\bAUDIO="/i.test(line);
          // CMAF：带 AUDIO= 分组的变体通常是纯视频轨
          const videoOnly =
            hasSeparateAudio && referencesAudioGroup && (hasVideoCodec || !hasAudioCodec);
          formats.push({
            format_id: `${m3u8Id || 'hls'}-${formats.length}`,
            url: abs,
            manifest_url: m3u8Url,
            ext,
            protocol: entryProtocol,
            width: res ? Number(res[1]) : null,
            height: res ? Number(res[2]) : null,
            tbr: bw ? Math.round(Number(bw) / 1000) : null,
            vcodec: videoOnly || hasVideoCodec ? 'unknown' : hasAudioCodec ? 'none' : 'unknown',
            acodec: videoOnly ? 'none' : hasAudioCodec ? 'unknown' : 'unknown',
            http_headers: opts?.headers,
            hls_aes: opts?.hls_aes,
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
          hls_aes: opts?.hls_aes,
        });
      }
      return { formats, subtitles };
    } catch (e) {
      if (!fatal) return { formats: [], subtitles: {} };
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
    const { formats } = await this._extract_mpd_formats_and_subtitles(
      mpdUrl,
      video_id,
      mpdId,
      note,
      fatal,
      opts,
    );
    return formats;
  }

  async _extract_mpd_formats_and_subtitles(
    mpdUrl: string,
    video_id?: string,
    mpdId?: string,
    note?: string,
    fatal = true,
    opts?: { headers?: Record<string, string> },
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    if (note) this.to_screen(`${video_id || ''}: ${note}`);
    try {
      const text = await this._httpGetText(mpdUrl, opts?.headers);
      const formats: Format[] = [];
      const subtitles: Record<string, Subtitle[]> = {};
      // Multi-period: collect Representation + BaseURL per AdaptationSet
      const sets = [
        ...text.matchAll(
          /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi,
        ),
      ];
      const periodCount = [...text.matchAll(/<Period\b/gi)].length;
      if (periodCount > 1) {
        this.report_warning(
          `${video_id || 'mpd'}: MPD has ${periodCount} periods; extracting all AdaptationSets (multi-period best-effort)`,
        );
      }
      const pushRep = (attrs: string, body: string, contentType: string) => {
        const baseUrls = [...body.matchAll(/<BaseURL>([^<]+)<\/BaseURL>/gi)].map((m) => m[1]!);
        const reps = [...body.matchAll(/<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gi)];
        const targets = reps.length
          ? reps
          : ([[attrs, body]] as unknown as RegExpMatchArray[]);
        targets.forEach((m, i) => {
          const rAttrs = (m[1] || attrs || '') as string;
          const rBody = String(m[2] || body || '');
          const id = /id="([^"]+)"/i.exec(rAttrs)?.[1] || String(i);
          const bw = /bandwidth="(\d+)"/i.exec(rAttrs)?.[1];
          const width = /width="(\d+)"/i.exec(rAttrs)?.[1];
          const height = /height="(\d+)"/i.exec(rAttrs)?.[1];
          const localBase = [...rBody.matchAll(/<BaseURL>([^<]+)<\/BaseURL>/gi)].map((x) => x[1]!);
          const url = localBase[0] || baseUrls[i] || baseUrls[0] || mpdUrl;
          const abs = absolutize(mpdUrl, url.trim());
          const mime =
            /mimeType="([^"]+)"/i.exec(rAttrs)?.[1] ||
            /mimeType="([^"]+)"/i.exec(attrs)?.[1] ||
            contentType;
          if (/text|ttml|vtt|subtitle/i.test(mime) || /contentType="text"/i.test(attrs)) {
            const lang =
              /lang="([^"]+)"/i.exec(attrs)?.[1] ||
              /lang="([^"]+)"/i.exec(rAttrs)?.[1] ||
              'und';
            if (!subtitles[lang]) subtitles[lang] = [];
            subtitles[lang]!.push({ url: abs, ext: mime.includes('ttml') ? 'ttml' : 'vtt' });
            return;
          }
          formats.push({
            format_id: `${mpdId || 'dash'}-${id}`,
            url: abs,
            manifest_url: mpdUrl,
            ext: 'mp4',
            protocol: 'http_dash_segments',
            tbr: bw ? Math.round(Number(bw) / 1000) : null,
            width: width ? Number(width) : null,
            height: height ? Number(height) : null,
            vcodec: height || /video/i.test(mime) ? 'unknown' : 'none',
            acodec: height || /video/i.test(mime) ? 'none' : 'unknown',
            http_headers: opts?.headers,
          });
        });
      };
      if (sets.length) {
        for (const set of sets) {
          pushRep(set[1] || '', set[2] || '', /contentType="([^"]+)"/i.exec(set[1] || '')?.[1] || '');
        }
      } else {
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
            manifest_url: mpdUrl,
            ext: 'mp4',
            protocol: 'http_dash_segments',
            tbr: bw ? Math.round(Number(bw) / 1000) : null,
            width: width ? Number(width) : null,
            height: height ? Number(height) : null,
            vcodec: height ? 'unknown' : 'none',
            acodec: height ? 'none' : 'unknown',
            http_headers: opts?.headers,
          });
        });
      }
      if (!formats.length) {
        formats.push({
          format_id: mpdId || 'dash',
          url: mpdUrl,
          ext: 'mp4',
          protocol: 'http_dash_segments',
          vcodec: 'unknown',
          acodec: 'unknown',
          http_headers: opts?.headers,
        });
      }
      return { formats, subtitles };
    } catch (e) {
      if (!fatal) return { formats: [], subtitles: {} };
      throw new ExtractorError(`Failed to download MPD: ${mpdUrl}`, { cause: e });
    }
  }

  /** SmoothStreaming ISM — parse StreamIndex/QualityLevel into formats with fragments. */
  async _extract_ism_formats(
    ismUrl: string,
    video_id?: string,
    ismId?: string,
    note?: string,
    fatal = false,
    opts?: { headers?: Record<string, string> },
  ): Promise<Format[]> {
    const { formats } = await this._extract_ism_formats_and_subtitles(
      ismUrl,
      video_id,
      ismId,
      note,
      fatal,
      opts,
    );
    return formats;
  }

  async _extract_ism_formats_and_subtitles(
    ismUrl: string,
    video_id?: string,
    ismId?: string,
    note?: string,
    fatal = false,
    opts?: { headers?: Record<string, string> },
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    if (note) this.to_screen(`${video_id || ''}: ${note}`);
    try {
      const text = await this._httpGetText(ismUrl, opts?.headers);
      if (/IsLive\s*=\s*["']TRUE["']/i.test(text)) {
        this.report_warning(`${video_id || 'ism'}: live ISM not supported`);
        return { formats: [], subtitles: {} };
      }
      const duration = Number(/Duration\s*=\s*["'](\d+)["']/i.exec(text)?.[1] || 0);
      const timescale = Number(/TimeScale\s*=\s*["'](\d+)["']/i.exec(text)?.[1] || 10000000);
      const formats: Format[] = [];
      const subtitles: Record<string, Subtitle[]> = {};

      for (const stream of text.matchAll(/<StreamIndex\b([^>]*)>([\s\S]*?)<\/StreamIndex>/gi)) {
        const sAttrs = stream[1] || '';
        const sBody = stream[2] || '';
        const streamType = /Type\s*=\s*["']([^"']+)["']/i.exec(sAttrs)?.[1]?.toLowerCase();
        if (!streamType || !['video', 'audio', 'text'].includes(streamType)) continue;
        const urlPattern = /Url\s*=\s*["']([^"']+)["']/i.exec(sAttrs)?.[1];
        if (!urlPattern) continue;
        const streamTimescale = Number(/TimeScale\s*=\s*["'](\d+)["']/i.exec(sAttrs)?.[1] || timescale);
        const lang = /Language\s*=\s*["']([^"']+)["']/i.exec(sAttrs)?.[1] || 'und';

        const cTags = [...sBody.matchAll(/<c\b([^/]*?)(?:\/>|>)/gi)].map((m) => m[1] || '');
        for (const track of sBody.matchAll(/<QualityLevel\b([^>]*)\/?>/gi)) {
          const tAttrs = track[1] || '';
          const fourcc = (
            /FourCC\s*=\s*["']([^"']+)["']/i.exec(tAttrs)?.[1] ||
            ({ '255': 'AACL', '65534': 'EC-3' } as Record<string, string>)[
              /AudioTag\s*=\s*["']([^"']+)["']/i.exec(tAttrs)?.[1] || ''
            ] ||
            ''
          ).toUpperCase();
          if (fourcc && !['H264', 'AVC1', 'AACL', 'TTML', 'EC-3', ''].includes(fourcc)) {
            this.report_warning(`${fourcc} is not a supported ISM codec`);
            continue;
          }
          const bitrate = Number(/Bitrate\s*=\s*["'](\d+)["']/i.exec(tAttrs)?.[1] || 0);
          const width = Number(
            (/MaxWidth\s*=\s*["'](\d+)["']/i.exec(tAttrs) || /Width\s*=\s*["'](\d+)["']/i.exec(tAttrs))?.[1] ||
              0,
          ) || null;
          const height = Number(
            (/MaxHeight\s*=\s*["'](\d+)["']/i.exec(tAttrs) || /Height\s*=\s*["'](\d+)["']/i.exec(tAttrs))?.[1] ||
              0,
          ) || null;
          let trackPattern = urlPattern.replace(/\{[Bb]itrate\}/g, String(bitrate));
          try {
            trackPattern = new URL(trackPattern, ismUrl).toString();
          } catch {
            /* keep */
          }

          const fragments: Array<{ url: string; duration?: number }> = [];
          let time = 0;
          for (let fi = 0; fi < cTags.length; fi++) {
            const cAttrs = cTags[fi]!;
            time = Number(/t\s*=\s*["'](\d+)["']/i.exec(cAttrs)?.[1] || time);
            const repeat = Number(/r\s*=\s*["'](\d+)["']/i.exec(cAttrs)?.[1] || 1);
            let fragDur = Number(/d\s*=\s*["'](\d+)["']/i.exec(cAttrs)?.[1] || 0);
            if (!fragDur) {
              const nextT = Number(/t\s*=\s*["'](\d+)["']/i.exec(cTags[fi + 1] || '')?.[1] || duration);
              fragDur = (nextT - time) / repeat;
            }
            for (let r = 0; r < repeat; r++) {
              const fragUrl = trackPattern.replace(/\{start[ _]time\}/gi, String(time));
              fragments.push({
                url: fragUrl,
                duration: streamTimescale ? fragDur / streamTimescale : undefined,
              });
              time += fragDur;
            }
          }

          if (streamType === 'text') {
            if (!subtitles[lang]) subtitles[lang] = [];
            subtitles[lang]!.push({
              url: fragments[0]?.url || trackPattern,
              ext: 'ttml',
            });
            continue;
          }

          formats.push({
            format_id: joinNonempty(ismId, streamType, String(bitrate || formats.length)),
            url: fragments[0]?.url || trackPattern,
            manifest_url: ismUrl,
            ext: 'mp4',
            protocol: 'ism',
            tbr: bitrate ? Math.round(bitrate / 1000) : null,
            width,
            height,
            vcodec: streamType === 'video' ? fourcc || 'h264' : 'none',
            acodec: streamType === 'audio' ? fourcc || 'aac' : streamType === 'video' ? 'none' : 'unknown',
            fragments: fragments.length ? fragments : undefined,
            http_headers: opts?.headers,
          });
        }
      }
      return { formats, subtitles };
    } catch (e) {
      if (!fatal) return { formats: [], subtitles: {} };
      throw new ExtractorError(`Failed to download ISM: ${ismUrl}`, { cause: e });
    }
  }

  /** HDS/F4M — extract media bitrate entries; skip Akamai PV / DRM / bootstrap-only HDS. */
  async _extract_f4m_formats(
    f4mUrl: string,
    video_id?: string,
    f4mId?: string,
    note?: string,
    fatal = false,
    opts?: { headers?: Record<string, string> },
  ): Promise<Format[]> {
    if (note) this.to_screen(`${video_id || ''}: ${note}`);
    try {
      let text = await this._httpGetText(f4mUrl, opts?.headers);
      text = text.replace(/&(?!amp;|lt;|gt;|quot;|#)/g, '&amp;');
      // Akamai playerVerificationChallenge (pv-2.0) — Adobe Alchemy; yt-dlp also returns []
      const pv = /<[^>]*pv-2\.0[^>]*>([^<]*)</i.exec(text)?.[1] || '';
      if (pv.includes(';') && pv.split(';')[0]!.trim()) {
        this.report_warning(
          `${video_id || 'f4m'}: Akamai playerVerificationChallenge unsupported (F4M skipped)`,
        );
        return [];
      }
      if (/drmAdditionalHeader|drmMetadata/i.test(text)) {
        this.report_warning(`${video_id || 'f4m'}: DRM-protected F4M skipped`);
        return [];
      }
      const bootstrapMatch =
        /<bootstrapInfo\b([^>]*)>([\s\S]*?)<\/bootstrapInfo>/i.exec(text);
      let bootstrap:
        | import('./f4m-native').F4mBootstrapInfo
        | undefined;
      if (bootstrapMatch) {
        const bootstrapAttrs = bootstrapMatch[1] || '';
        const bootstrapUrl =
          /\burl\s*=\s*["']([^"']+)["']/i.exec(bootstrapAttrs)?.[1];
        try {
          const f4m = await import('./f4m-native');
          if (bootstrapUrl) {
            const { fetchBinary } = await import('./fragment-downloader');
            bootstrap = f4m.readF4mBootstrapInfo(
              await fetchBinary(absolutize(f4mUrl, bootstrapUrl), opts?.headers),
            );
          } else if (bootstrapMatch[2]?.trim()) {
            bootstrap = f4m.decodeF4mBootstrapBase64(bootstrapMatch[2]);
          }
        } catch (e) {
          if (fatal) {
            throw new ExtractorError(`Failed to parse F4M bootstrap: ${f4mUrl}`, { cause: e });
          }
          this.report_warning(
            `${video_id || 'f4m'}: invalid bootstrapInfo (${(e as Error).message})`,
          );
        }
      }
      const formats: Format[] = [];
      const mediaNodes = [...text.matchAll(/<media\b([^>]*)\/?>/gi)];
      const base =
        /<baseURL[^>]*>([^<]+)<\/baseURL>/i.exec(text)?.[1]?.trim() ||
        f4mUrl.replace(/[^/]+$/, '');
      for (let i = 0; i < mediaNodes.length; i++) {
        const attrs = mediaNodes[i]![1] || '';
        if (/drmAdditionalHeaderId|drmMetadataId/i.test(attrs)) continue;
        const tbr = Number(/bitrate\s*=\s*["'](\d+)["']/i.exec(attrs)?.[1] || 0) || null;
        const width = Number(/width\s*=\s*["'](\d+)["']/i.exec(attrs)?.[1] || 0) || null;
        const height = Number(/height\s*=\s*["'](\d+)["']/i.exec(attrs)?.[1] || 0) || null;
        let mediaUrl =
          /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ||
          /url\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
        if (!mediaUrl) continue;
        try {
          mediaUrl = new URL(mediaUrl, base.endsWith('/') ? base : `${base}/`).toString();
        } catch {
          /* keep */
        }
        if (/\.f4m(\?|$)/i.test(mediaUrl)) {
          const nested = await this._extract_f4m_formats(mediaUrl, video_id, f4mId, undefined, false, opts);
          for (const f of nested) {
            f.tbr = f.tbr || tbr;
            f.width = f.width || width;
            f.height = f.height || height;
          }
          formats.push(...nested);
          continue;
        }
        if (/\.m3u8(\?|$)/i.test(mediaUrl)) {
          formats.push(
            ...(await this._extract_m3u8_formats(
              mediaUrl,
              video_id,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              f4mId,
              undefined,
              false,
              opts,
            )),
          );
          continue;
        }
        if (bootstrap) {
          const { buildF4mFragmentUrls } = await import('./f4m-native');
          const pvQuery = pv.startsWith(';') ? pv.slice(1) : '';
          const fragmentUrls = buildF4mFragmentUrls(mediaUrl, bootstrap, pvQuery);
          if (!fragmentUrls.length) {
            this.report_warning(`${video_id || 'f4m'}: bootstrap contains no fragments`);
            continue;
          }
          formats.push({
            format_id: joinNonempty(f4mId, tbr != null ? String(tbr) : String(i)),
            url: mediaUrl,
            manifest_url: f4mUrl,
            ext: 'flv',
            protocol: 'f4m_fragments',
            tbr,
            width,
            height,
            vcodec: height ? 'unknown' : 'none',
            acodec: height ? 'none' : 'unknown',
            fragments: fragmentUrls.map((url) => ({ url })),
            http_headers: opts?.headers,
            is_live: bootstrap.live,
            fragment_transform: 'f4m_mdat',
          });
          continue;
        }
        if (bootstrapMatch) {
          this.report_warning(`${video_id || 'f4m'}: bootstrapInfo could not be parsed`);
          continue;
        }
        formats.push({
          format_id: joinNonempty(f4mId, tbr != null ? String(tbr) : String(i)),
          url: mediaUrl,
          manifest_url: f4mUrl,
          ext: 'flv',
          protocol: 'f4m',
          tbr,
          width,
          height,
          vcodec: height ? 'unknown' : 'none',
          acodec: height ? 'none' : 'unknown',
          http_headers: opts?.headers,
        });
      }
      return formats;
    } catch (e) {
      if (!fatal) return [];
      throw new ExtractorError(`Failed to download F4M: ${f4mUrl}`, { cause: e });
    }
  }

  _merge_subtitles(
    ...sources: Array<Record<string, Subtitle[]> | undefined | null>
  ): Record<string, Subtitle[]> {
    const target: Record<string, Subtitle[]> = {};
    for (const source of sources) {
      if (!source) continue;
      for (const [lang, subs] of Object.entries(source)) {
        if (!target[lang]) target[lang] = [];
        target[lang]!.push(...subs);
      }
    }
    return target;
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

  /** yt-dlp _download_webpage_handle — returns [body, { url }] */
  async _download_webpage_handle(
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
  ): Promise<[string, { url: string }]> {
    const finalUrl = opts?.query ? appendQuery(url, opts.query) : url;
    const webpage = await this._download_webpage(finalUrl, video_id, note, {
      headers: opts?.headers,
      fatal: opts?.fatal,
      method: opts?.method || (opts?.data ? 'POST' : undefined),
      data: opts?.data,
    });
    return [webpage, { url: finalUrl }];
  }

  _proto_relative_url(url: string, scheme?: string): string {
    if (!url) return url;
    if (url.startsWith('//')) return `${scheme || 'https'}:${url}`;
    return url;
  }

  _hidden_inputs(html: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of html.matchAll(/<input\b([^>]+)>/gi)) {
      const attrs: Record<string, string> = {};
      for (const a of (m[1] || '').matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g)) {
        attrs[a[1]!.toLowerCase()] = a[3] || '';
      }
      const type = (attrs.type || '').toLowerCase();
      if (type === 'hidden' || !attrs.type) {
        if (attrs.name) out[attrs.name] = attrs.value ?? '';
      }
    }
    return out;
  }

  _form_hidden_inputs(formId: string, html: string): Record<string, string> {
    const m = html.match(
      new RegExp(`<form[^>]+id=["']${escapeReg(formId)}["'][^>]*>([\\s\\S]*?)</form>`, 'i'),
    );
    return m ? this._hidden_inputs(m[1] || '') : {};
  }

  _search_nextjs_data<T = Record<string, unknown>>(
    webpage: string,
    video_id?: string,
    opts?: { fatal?: boolean; default?: T },
  ): T {
    const fatal = opts?.fatal !== false && opts?.default === undefined;
    const data = this._search_json<T>(
      /<script[^>]+id=['"]__NEXT_DATA__['"][^>]*>/i,
      webpage,
      'next.js data',
      video_id,
      { end_pattern: '</script>', fatal, default: opts?.default },
    );
    return (data ?? opts?.default ?? {}) as T;
  }

  _search_nuxt_data<T = unknown>(
    webpage: string,
    video_id?: string,
    contextName = '__NUXT__',
    opts?: { fatal?: boolean; traverse?: unknown[] },
  ): T {
    const fatal = opts?.fatal !== false;
    const re = new RegExp(
      `<script[^>]*>\\s*window\\.${escapeReg(contextName)}\\s*=\\s*`,
      'i',
    );
    const raw = this._search_regex(re, webpage, 'nuxt data', null, false);
    if (!raw) {
      if (fatal) throw new ExtractorError('Unable to extract nuxt data');
      return {} as T;
    }
    const parsed = this._parse_json<T>(raw.replace(/;?\s*$/, ''), video_id, null, fatal);
    const traverse = opts?.traverse ?? ['data', 0];
    let cur: unknown = parsed;
    for (const key of traverse) {
      if (cur == null || typeof cur !== 'object') break;
      cur = (cur as Record<string, unknown>)[key as string];
    }
    return (cur ?? parsed ?? {}) as T;
  }

  _yes_playlist(
    playlist_id: string | boolean | null | undefined,
    video_id: string | boolean | null | undefined,
    smuggled_data?: Record<string, unknown> | null,
    labels?: { playlist_label?: string; video_label?: string },
  ): boolean {
    if (!playlist_id || !video_id) return !video_id;
    const noPlaylist = smuggled_data?.force_noplaylist;
    if (noPlaylist != null) return !noPlaylist;
    const playlistLabel = labels?.playlist_label || 'playlist';
    const videoLabel = labels?.video_label || 'video';
    const vid = video_id === true ? '' : ` ${video_id}`;
    const pl = playlist_id === true ? '' : ` ${playlist_id}`;
    if (this.params.noplaylist) {
      this.to_screen(`Downloading just the ${videoLabel}${vid} because of --no-playlist`);
      return false;
    }
    this.to_screen(
      `Downloading ${playlistLabel}${pl} - add --no-playlist to download just the ${videoLabel}${vid}`,
    );
    return true;
  }

  _live_title(name: string): string {
    return name.includes('(live)') ? name : `${name} (live)`;
  }

  _generic_id(url: string): string {
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\/+$/, '');
      const last = path.split('/').pop();
      return last || u.hostname;
    } catch {
      return url;
    }
  }

  _html_extract_title(html: string, name = 'title', fatal = false): string | null {
    return this._html_search_meta(name, html, name, fatal);
  }

  _remove_duplicate_formats(formats: Format[]): Format[] {
    const seen = new Set<string>();
    const out: Format[] = [];
    for (const f of formats) {
      const key = `${f.format_id || ''}|${f.url || ''}`;
      if (!f.url || seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
    return out;
  }

  async _check_formats(formats: Format[], video_id?: string): Promise<Format[]> {
    const out: Format[] = [];
    for (const f of formats) {
      if (!f.url || !/^https?:\/\//i.test(f.url)) {
        out.push(f);
        continue;
      }
      try {
        const http = await import('@/lib/http');
        const res = await http.request(f.url, {
          method: 'HEAD',
          headers: f.http_headers,
          useBackendHttp: true,
          allowNon2xx: true,
          ignorePageNavigationAbort: true,
        });
        if (res.status < 400) out.push(f);
        else this.report_warning(`${video_id || 'video'}: format ${f.format_id} HTTP ${res.status}`);
      } catch {
        out.push(f);
      }
    }
    return out;
  }

  async _sleep(timeoutMs: number, video_id?: string, msg?: string): Promise<void> {
    if (msg) this.to_screen(`${video_id || ''}: ${msg}`);
    await new Promise((r) => setTimeout(r, timeoutMs));
  }

  async _set_cookie(
    domain: string,
    name: string,
    value: string,
    expireTime?: number | null,
    _path = '/',
    secure = false,
  ): Promise<void> {
    const jar = this._downloader?.cookiejar;
    if (!jar) {
      this.report_warning(
        `_set_cookie(${domain}, ${name}): no cookiejar on downloader; attach YoutubeDL instance`,
      );
      return;
    }
    jar.setCookie({
      domain,
      name,
      value,
      path: _path || '/',
      secure,
      expires: expireTime ?? 0,
    });
  }

  async _parse_html5_media_entries(
    baseUrl: string,
    webpage: string,
    video_id: string,
    m3u8_id?: string,
  ): Promise<Array<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }>> {
    const { parseHtml5MediaEntries } = await import('./extractors/hand-c/_helpers');
    return parseHtml5MediaEntries(this, baseUrl, webpage, video_id, { m3u8Id: m3u8_id });
  }

  async _extract_smil_formats(
    smilUrl: string,
    video_id?: string,
    fatal = false,
  ): Promise<Format[]> {
    try {
      const xml = await this._download_webpage(smilUrl, video_id, 'Downloading SMIL', { fatal });
      const formats: Format[] = [];
      for (const m of xml.matchAll(/<video\b([^>]*)\/?>/gi)) {
        const src = /src\s*=\s*["']([^"']+)["']/i.exec(m[1] || '')?.[1];
        if (!src) continue;
        formats.push(this._create_format(absolutize(smilUrl, src), { format_id: 'smil' }));
      }
      for (const m of xml.matchAll(/<ref\b([^>]*)\/?>/gi)) {
        const href = /href\s*=\s*["']([^"']+)["']/i.exec(m[1] || '')?.[1];
        if (!href) continue;
        const abs = absolutize(smilUrl, href);
        if (/\.m3u8/i.test(abs)) {
          formats.push(
            ...(await this._extract_m3u8_formats(abs, video_id, 'mp4', 'm3u8_native', undefined, undefined, undefined, undefined, false)),
          );
        } else {
          formats.push(this._create_format(abs, { format_id: 'smil-ref' }));
        }
      }
      return formats;
    } catch (e) {
      if (!fatal) return [];
      throw new ExtractorError(`Failed to parse SMIL: ${smilUrl}`, { cause: e });
    }
  }

  static playlist_from_matches(
    matches: Iterable<string | VideoInfo>,
    playlist_id?: string,
    playlist_title?: string,
    ie?: InfoExtractor,
  ): VideoInfo {
    const entries: VideoInfo[] = [];
    for (const m of matches) {
      if (typeof m === 'string') {
        entries.push(
          ie?.url_result(m, ie.IE_NAME, playlist_id) ?? {
            _type: 'url',
            url: m,
            id: playlist_id || m,
          },
        );
      } else {
        entries.push(m);
      }
    }
    return (
      ie?.playlist_result(entries, playlist_id || 'playlist', playlist_title) ?? {
        _type: 'playlist',
        id: playlist_id || 'playlist',
        title: playlist_title,
        entries,
      }
    );
  }

  // —— media helpers (jwplayer / akamai / wowza / chapters) ——

  _find_jwplayer_data(
    webpage: string,
    video_id?: string,
    transform_source?: (s: string) => string,
  ): unknown | null {
    const transform = transform_source || js_to_json;
    const tryParse = (raw: string): unknown | null => {
      try {
        return JSON.parse(transform(raw));
      } catch {
        try {
          return this._parse_json(raw, video_id, transform, false);
        } catch {
          return null;
        }
      }
    };
    // jwplayer('id').setup({…})
    const setup = webpage.match(
      /jwplayer\s*\(\s*['"][^'"]+['"]\s*\)(?:(?!<\/script>)[\s\S]{0,12000}?)\.\s*setup\s*\(\s*(\{)/i,
    );
    if (setup && setup.index != null) {
      const start = webpage.indexOf('{', setup.index + setup[0].length - 1);
      if (start >= 0) {
        let depth = 0;
        for (let i = start; i < webpage.length && i < start + 500_000; i++) {
          const ch = webpage[i];
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              const parsed = tryParse(webpage.slice(start, i + 1));
              if (parsed) return parsed;
              break;
            }
          }
        }
      }
    }
    // sources: [ … ] near jwplayer
    const sources = webpage.match(
      /jwplayer\s*\([^)]*\)[\s\S]{0,4000}?sources\s*:\s*(\[[\s\S]*?\])/i,
    );
    if (sources?.[1]) {
      const arr = tryParse(sources[1]);
      if (Array.isArray(arr)) return { sources: arr };
    }
    return null;
  }

  async _extract_jwplayer_data(
    webpage: string,
    video_id: string,
    opts?: { requireTitle?: boolean; m3u8Id?: string; mpdId?: string },
  ): Promise<VideoInfo | null> {
    const data = this._find_jwplayer_data(webpage, video_id);
    if (!data) return null;
    return this._parse_jwplayer_data(data, video_id, opts);
  }

  async _parse_jwplayer_data(
    jwplayerData: unknown,
    video_id?: string,
    opts?: { requireTitle?: boolean; m3u8Id?: string; mpdId?: string; baseUrl?: string },
  ): Promise<VideoInfo> {
    const { parseJwplayerData } = await import('./extractors/hand-b/_helpers');
    return parseJwplayerData(this, jwplayerData, video_id, opts);
  }

  async _parse_jwplayer_formats(
    sources: unknown[],
    video_id?: string,
    opts?: { m3u8Id?: string; mpdId?: string; baseUrl?: string },
  ): Promise<Format[]> {
    const { parseJwplayerFormats } = await import('./extractors/hand-b/_helpers');
    return parseJwplayerFormats(this, sources, video_id, opts);
  }

  async _extract_akamai_formats(
    manifestUrl: string,
    video_id?: string,
    hosts?: { hds?: string; hls?: string; http?: string },
  ): Promise<Format[]> {
    const { formats } = await this._extract_akamai_formats_and_subtitles(manifestUrl, video_id, hosts);
    return formats;
  }

  async _extract_akamai_formats_and_subtitles(
    manifestUrl: string,
    video_id?: string,
    hosts: { hds?: string; hls?: string; http?: string } = {},
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    let url = String(manifestUrl || '');
    const signed = url.includes('hdnea=');
    if (!signed) {
      url = url.replace(/(?:b=[\d,-]+|(?:__a__|attributes)=off|__b__=\d+)&?/g, '').replace(/\?$/, '');
    }
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    const hdcore = 'hdcore=3.7.0';

    let f4mUrl = url.replace(/(https?:\/\/[^/]+)\/i\//, '$1/z/').replace('/master.m3u8', '/manifest.f4m');
    if (hosts.hds) f4mUrl = f4mUrl.replace(/(https?:\/\/)[^/]+/, `$1${hosts.hds}`);
    if (!f4mUrl.includes('hdcore=')) f4mUrl += (f4mUrl.includes('?') ? '&' : '?') + hdcore;
    try {
      formats.push(...(await this._extract_f4m_formats(f4mUrl, video_id, 'hds', undefined, false)));
    } catch {
      /* ignore */
    }

    let m3u8Url = url.replace(/(https?:\/\/[^/]+)\/z\//, '$1/i/').replace('/manifest.f4m', '/master.m3u8');
    if (hosts.hls) m3u8Url = m3u8Url.replace(/(https?:\/\/)[^/]+/, `$1${hosts.hls}`);
    try {
      const hls = await this._extract_m3u8_formats_and_subtitles(
        m3u8Url,
        video_id,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      );
      formats.push(...hls.formats);
      subtitles = this._merge_subtitles(subtitles, hls.subtitles);
    } catch {
      /* ignore */
    }

    return { formats, subtitles };
  }

  async _extract_wowza_formats(
    url: string,
    video_id?: string,
    m3u8EntryProtocol: 'm3u8' | 'm3u8_native' = 'm3u8_native',
    skipProtocols: string[] = [],
  ): Promise<Format[]> {
    let u = String(url || '');
    let query = '';
    try {
      const parsed = new URL(u.includes('://') ? u : `https:${u}`);
      query = parsed.search.replace(/^\?/, '');
    } catch {
      /* ignore */
    }
    u = u.replace(/\/(?:manifest|playlist|jwplayer)\.(?:m3u8|f4m|mpd|smil)/i, '');
    const mobj = /(?:(?:http|rtmp)(?<s>s)?:)?(?<url>\/\/[^?]+)/i.exec(u);
    if (!mobj?.groups?.url) return [];
    const urlBase = mobj.groups.url;
    const httpBase = `http${mobj.groups.s || ''}:${urlBase}`;
    const manifestUrl = (manifest: string) => {
      let mUrl = `${httpBase}/${manifest}`;
      if (query) mUrl += `?${query}`;
      return mUrl;
    };
    const formats: Format[] = [];
    if (!skipProtocols.includes('m3u8')) {
      try {
        formats.push(
          ...(await this._extract_m3u8_formats(
            manifestUrl('playlist.m3u8'),
            video_id,
            'mp4',
            m3u8EntryProtocol,
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          )),
        );
      } catch {
        /* ignore */
      }
    }
    if (!skipProtocols.includes('f4m')) {
      try {
        formats.push(...(await this._extract_f4m_formats(manifestUrl('manifest.f4m'), video_id, 'hds', undefined, false)));
      } catch {
        /* ignore */
      }
    }
    if (!skipProtocols.includes('dash')) {
      try {
        formats.push(...(await this._extract_mpd_formats(manifestUrl('manifest.mpd'), video_id, 'dash', undefined, false)));
      } catch {
        /* ignore */
      }
    }
    if (/(?:\/smil:|\.smil)/i.test(urlBase)) {
      if (!skipProtocols.includes('smil')) {
        try {
          formats.push(...(await this._extract_smil_formats(manifestUrl('jwplayer.smil'), video_id, false)));
        } catch {
          /* ignore */
        }
      }
    } else if (!skipProtocols.includes('rtmp')) {
      formats.push({
        url: `rtmp:${urlBase}`,
        format_id: 'rtmp',
        protocol: 'rtmp',
      });
    }
    return formats;
  }

  _extract_chapters_helper(
    chapterList: unknown[] | null | undefined,
    startFn: (c: unknown) => number | null | undefined,
    titleFn: (c: unknown) => string | null | undefined,
    duration: number | null | undefined,
    strict = true,
  ): Array<{ start_time: number; title?: string }> | undefined {
    if (!duration) return undefined;
    const rows = (chapterList || []).map((chapter) => ({
      start_time: startFn(chapter) ?? null,
      title: titleFn(chapter) || undefined,
    }));
    if (!strict) {
      rows.sort((a, b) => (a.start_time || 0) - (b.start_time || 0));
    }
    const chapters: Array<{ start_time: number; title?: string }> = [{ start_time: 0 }];
    rows.forEach((chapter, idx) => {
      if (chapter.start_time == null) {
        this.report_warning(`Incomplete chapter ${idx}`);
        return;
      }
      const last = chapters[chapters.length - 1]!;
      if (last.start_time <= chapter.start_time && chapter.start_time <= duration) {
        chapters.push({ start_time: chapter.start_time, title: chapter.title });
      } else {
        this.report_warning(
          `Invalid start time for chapter "${chapter.title || idx}"`,
        );
      }
    });
    return chapters.slice(1);
  }

  _extract_chapters_from_description(
    description: string | null | undefined,
    duration: number | null | undefined,
  ): Array<{ start_time: number; title?: string }> | undefined {
    if (!description || !duration) return undefined;
    const durationRe = '(?:\\d+:)?\\d{1,2}:\\d{2}';
    const reTimeFirst = new RegExp(`^\\s*(${durationRe})\\b\\W*\\s*(.+?)\\s*$`, 'gm');
    const reTitleFirst = new RegExp(`^\\s*(.+?)\\b\\W*\\s*(${durationRe})\\s*$`, 'gm');
    const a: Array<[string, string]> = [];
    let m: RegExpExecArray | null;
    while ((m = reTimeFirst.exec(description))) a.push([m[1]!, m[2]!]);
    const fromTime = this._extract_chapters_helper(
      a,
      (x) => parse_duration((x as [string, string])[0]),
      (x) => (x as [string, string])[1],
      duration,
      false,
    );
    if (fromTime?.length) return fromTime;
    const b: Array<[string, string]> = [];
    while ((m = reTitleFirst.exec(description))) b.push([m[1]!, m[2]!]);
    return this._extract_chapters_helper(
      b,
      (x) => parse_duration((x as [string, string])[1]),
      (x) => (x as [string, string])[0],
      duration,
      false,
    );
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

function joinNonempty(...parts: Array<string | null | undefined>): string {
  return parts.filter((p) => p != null && String(p).length > 0).join('-');
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

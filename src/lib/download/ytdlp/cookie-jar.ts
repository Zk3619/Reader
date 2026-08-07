/**
 * In-memory cookie jar for InfoExtractor._set_cookie / _get_cookies.
 * Complements Netscape text + platform jar (cookies.ts).
 */

import type { NetscapeCookie } from './cookies';
import { buildCookieHeader, mergeCookieHeaders } from './cookies';

export interface JarCookie {
  domain: string;
  name: string;
  value: string;
  path?: string;
  secure?: boolean;
  expires?: number;
}

export class YtdlpCookieJar {
  private cookies: JarCookie[] = [];

  setCookie(c: JarCookie): void {
    const domain = c.domain.startsWith('.') ? c.domain : c.domain;
    const idx = this.cookies.findIndex(
      (x) =>
        x.domain === domain &&
        x.name === c.name &&
        (x.path || '/') === (c.path || '/'),
    );
    const next: JarCookie = {
      domain,
      name: c.name,
      value: c.value,
      path: c.path || '/',
      secure: !!c.secure,
      expires: c.expires ?? 0,
    };
    if (idx >= 0) this.cookies[idx] = next;
    else this.cookies.push(next);
  }

  clear(): void {
    this.cookies = [];
  }

  toNetscape(): NetscapeCookie[] {
    return this.cookies.map((c) => ({
      domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
      includeSubdomains: true,
      path: c.path || '/',
      secure: !!c.secure,
      expires: c.expires ?? 0,
      name: c.name,
      value: c.value,
    }));
  }

  getCookieHeader(url: string): string {
    return buildCookieHeader(this.toNetscape(), url);
  }

  /** Merge jar header with existing Cookie header string. */
  mergeIntoHeader(url: string, existing?: string): string {
    return mergeCookieHeaders(existing, this.getCookieHeader(url));
  }

  snapshot(): JarCookie[] {
    return this.cookies.map((c) => ({ ...c }));
  }
}

/** Process-wide jar shared when YoutubeDL instances don't attach one. */
let sharedJar: YtdlpCookieJar | null = null;

export function getSharedCookieJar(): YtdlpCookieJar {
  if (!sharedJar) sharedJar = new YtdlpCookieJar();
  return sharedJar;
}

/**
 * In-memory + localStorage-backed extractor cache (yt-dlp cache.py subset).
 */

export type CacheStore = {
  get(key: string): string | null;
  set(key: string, value: string, ttlSec?: number): void;
  remove(key: string): void;
  clear(prefix?: string): void;
};

type Entry = { v: string; exp?: number };

const mem = new Map<string, Entry>();
const PREFIX = 'ytdlp-cache:';

function storage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

export class YtdlpCache implements CacheStore {
  constructor(private scope = 'default') {}

  private k(key: string): string {
    return `${PREFIX}${this.scope}:${key}`;
  }

  get(key: string): string | null {
    const full = this.k(key);
    const hit = mem.get(full);
    if (hit) {
      if (hit.exp && hit.exp < Date.now()) {
        mem.delete(full);
        return null;
      }
      return hit.v;
    }
    const ls = storage();
    if (!ls) return null;
    try {
      const raw = ls.getItem(full);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Entry;
      if (parsed.exp && parsed.exp < Date.now()) {
        ls.removeItem(full);
        return null;
      }
      mem.set(full, parsed);
      return parsed.v;
    } catch {
      return null;
    }
  }

  set(key: string, value: string, ttlSec = 86400): void {
    const full = this.k(key);
    const entry: Entry = {
      v: value,
      exp: ttlSec > 0 ? Date.now() + ttlSec * 1000 : undefined,
    };
    mem.set(full, entry);
    const ls = storage();
    if (ls) {
      try {
        ls.setItem(full, JSON.stringify(entry));
      } catch {
        /* quota */
      }
    }
  }

  remove(key: string): void {
    const full = this.k(key);
    mem.delete(full);
    storage()?.removeItem(full);
  }

  clear(prefix?: string): void {
    const p = prefix ? this.k(prefix) : `${PREFIX}${this.scope}:`;
    for (const k of [...mem.keys()]) {
      if (k.startsWith(p)) mem.delete(k);
    }
    const ls = storage();
    if (!ls) return;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k?.startsWith(p)) keys.push(k);
    }
    for (const k of keys) ls.removeItem(k);
  }
}

let shared: YtdlpCache | null = null;
export function getYtdlpCache(scope = 'default'): YtdlpCache {
  if (!shared || scope !== 'default') {
    if (scope === 'default') {
      shared = new YtdlpCache('default');
      return shared;
    }
    return new YtdlpCache(scope);
  }
  return shared;
}

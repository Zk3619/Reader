/**
 * Extractor registry — register / resolve by URL, load built-ins + generated stubs.
 */

import type { InfoExtractor, DownloaderLike } from './common';
import type { ExtractorEntry } from './types';

const _entries: ExtractorEntry[] = [];
const _byKey = new Map<string, ExtractorEntry>();

function compileValidUrl(valid: ExtractorEntry['valid_url']): RegExp | RegExp[] | undefined {
  if (valid === false || valid == null) return undefined;
  const compileOne = (s: string | RegExp): RegExp | null => {
    if (s instanceof RegExp) return s;
    try {
      let src = s;
      let flags = '';
      // Python verbose / inline flags
      if (src.startsWith('(?x)') || src.startsWith('(?ix)') || src.startsWith('(?xi)') || src.startsWith('(?i)')) {
        const m = src.match(/^\(\?([ixmsu]+)\)/);
        if (m) {
          flags = m[1]!.replace(/x/g, '');
          src = src.slice(m[0].length);
        }
        if (flags.includes('x') || m?.[1]?.includes('x')) {
          src = src.replace(/(^|[^\\])#.*$/gm, '$1').replace(/\s+/g, '');
          flags = flags.replace(/x/g, '');
        }
      }
      // Python named groups (?P<name>…) → JS (?<name>…)
      src = src.replace(/\(\?P</g, '(?<');
      // Drop other Python-only extensions that break JS
      src = src.replace(/\(\?P=/g, '(?='); // shouldn't happen but safe
      return new RegExp(src, flags);
    } catch {
      return null;
    }
  };
  if (Array.isArray(valid)) {
    const list = valid.map(compileOne).filter(Boolean) as RegExp[];
    return list.length ? list : undefined;
  }
  const one = compileOne(valid as string | RegExp);
  return one ?? undefined;
}

export function registerExtractor(entry: ExtractorEntry): void {
  const compiled = compileValidUrl(entry.valid_url);
  const full: ExtractorEntry = {
    ...entry,
    valid_url_re: compiled,
  };
  const existing = _byKey.get(entry.ie_key);
  if (existing) {
    const idx = _entries.indexOf(existing);
    if (idx >= 0) _entries[idx] = full;
  } else {
    _entries.push(full);
  }
  _byKey.set(entry.ie_key, full);
}

export function getExtractorEntry(ieKey: string): ExtractorEntry | undefined {
  ensureBuiltinLoaded();
  return _byKey.get(ieKey) ?? _byKey.get(ieKey.toLowerCase());
}

export function listExtractors(): ExtractorEntry[] {
  ensureBuiltinLoaded();
  return [..._entries];
}

export function getExtractorForUrl(
  url: string,
  downloader?: DownloaderLike | null,
): InfoExtractor | null {
  ensureBuiltinLoaded();
  for (const entry of _entries) {
    if (entry.ie_key === 'generic') continue;
    if (entryMatches(entry, url)) {
      const ie = entry.create();
      if (downloader) ie.set_downloader(downloader);
      return ie;
    }
  }
  // Generic last
  const generic = _byKey.get('generic');
  if (generic) {
    const ie = generic.create();
    if (downloader) ie.set_downloader(downloader);
    return ie;
  }
  return null;
}

function entryMatches(entry: ExtractorEntry, url: string): boolean {
  if (entry.valid_url === false) return false;
  if (entry.valid_url_re) {
    const list = Array.isArray(entry.valid_url_re) ? entry.valid_url_re : [entry.valid_url_re];
    return list.some((r) => {
      try {
        return r.test(url);
      } catch {
        return false;
      }
    });
  }
  // No compiled pattern and no source — skip (avoid instantiating 2k stubs)
  if (entry.valid_url == null) return false;
  try {
    const compiled = compileValidUrl(entry.valid_url);
    if (!compiled) return false;
    const list = Array.isArray(compiled) ? compiled : [compiled];
    return list.some((r) => r.test(url));
  } catch {
    return false;
  }
}

export function ensureBuiltinLoaded(): void {
  // Registration is a side effect of importing `./extractors` (see ytdlp/index.ts).
}

/** Synchronous ensure used when extractors/index already imported */
export function markRegistryLoaded(): void {
  /* registry is populated by registerExtractor calls */
}

export function resetRegistryForTests(): void {
  _entries.length = 0;
  _byKey.clear();
}

import type { NewBookSource } from '@/types';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import { parseBookSourceJson } from '@/lib/book-source/source-import';
import * as sourcesDb from '@/lib/database/sources';

export interface ResolvedBookSources {
  sources: NewBookSource[];
}

export async function resolveBookSourcesFromNetworkUrl(urlRaw: string): Promise<ResolvedBookSources> {
  const url = urlRaw.trim();
  if (!url) return { sources: [] };
  let text = '';
  if (isTauri()) {
    text = await invoke<string>('fetch_url_text', { url, timeoutMs: 30000 });
  } else {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`请求失败: ${res.status}`);
    text = await res.text();
  }
  return { sources: parseBookSourceJson(text) };
}

export async function resolveBookSourcesFromFile(file: File): Promise<ResolvedBookSources> {
  const text = await file.text();
  return { sources: parseBookSourceJson(text) };
}

export async function resolveBookSourcesFromText(text: string): Promise<ResolvedBookSources> {
  return { sources: parseBookSourceJson(text) };
}

export async function importSelectedBookSources(sources: NewBookSource[]): Promise<number> {
  let inserted = 0;
  for (const source of sources) {
    await sourcesDb.insertSource(source);
    inserted += 1;
  }
  if (inserted > 0) {
    window.dispatchEvent(new CustomEvent('sources-refresh'));
  }
  return inserted;
}

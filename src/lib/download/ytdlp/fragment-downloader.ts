/**
 * Fragment / DASH-ISM segment downloader — pure TS orchestration over Tauri binary fetch.
 * Prefer concatenating segments in-process; ffmpeg only as last-resort remux of the result.
 */

import type { Format } from './types';

export type FragmentPart = { url: string; duration?: number; filesize?: number };

export function collectFragments(format: Format): FragmentPart[] {
  const frags = format.fragments;
  if (Array.isArray(frags) && frags.length) {
    return frags
      .map((f) => ({
        url: String(f.url || ''),
        duration: typeof f.duration === 'number' ? f.duration : undefined,
        filesize: typeof f.filesize === 'number' ? f.filesize : undefined,
      }))
      .filter((f) => /^https?:\/\//i.test(f.url));
  }
  return [];
}

/** Download fragment URLs via Tauri `download_binary` and concat into one ArrayBuffer. */
export async function downloadFragmentsConcat(
  fragments: FragmentPart[],
  headers?: Record<string, string>,
  opts?: {
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
    decrypt?: (chunk: Uint8Array, index: number) => Promise<Uint8Array> | Uint8Array;
  },
): Promise<Uint8Array> {
  if (!fragments.length) throw new Error('No fragments to download');
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 4, 8));
  const chunks: Uint8Array[] = new Array(fragments.length);
  let done = 0;

  const fetchOne = async (index: number): Promise<void> => {
    const frag = fragments[index]!;
    const bytes = await fetchBinary(frag.url, headers);
    const out = opts?.decrypt ? await opts.decrypt(bytes, index) : bytes;
    chunks[index] = out;
    done += 1;
    opts?.onProgress?.(done, fragments.length);
  };

  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, fragments.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= fragments.length) break;
      await fetchOne(i);
    }
  });
  await Promise.all(workers);

  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

export async function fetchBinary(url: string, headers?: Record<string, string>): Promise<Uint8Array> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ data: number[]; status: number }>('download_binary', {
      url,
      method: 'GET',
      headers: headers || {},
      body: null,
      timeoutMs: 60000,
      useOkhttpUserAgent: false,
      proxy: null,
    });
    if (result.status >= 400) throw new Error(`HTTP ${result.status}`);
    return new Uint8Array(result.data);
  } catch (primary) {
    if (typeof fetch === 'function') {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    }
    throw primary;
  }
}

/** Write concatenated fragments to disk via Tauri when available. */
export async function writeFragmentsToFile(
  fragments: FragmentPart[],
  outputPath: string,
  headers?: Record<string, string>,
): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const r = await invoke<{ outputPath?: string }>('media_convert_fetch_fragments', {
      urls: fragments.map((f) => f.url),
      outputPath,
      headers: headers || null,
      concurrency: 4,
    });
    return String(r?.outputPath || outputPath);
  } catch {
    // Fallback: download in JS and write via invoke write_file if present
    const bytes = await downloadFragmentsConcat(fragments, headers);
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_binary_file', { path: outputPath, data: Array.from(bytes) }).catch(
      async () => {
        // Last resort: data URL not useful for large files — rethrow
        throw new Error('Fragment write requires Tauri media_convert_fetch_fragments');
      },
    );
    return outputPath;
  }
}

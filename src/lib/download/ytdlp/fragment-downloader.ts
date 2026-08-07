/**
 * Fragment / DASH-ISM segment downloader ??pure TS orchestration over Tauri binary fetch.
 * Prefer concatenating segments in-process; ffmpeg only as last-resort remux of the result.
 */

import type { Format } from './types';

import { downloadBinaryProxyArgs } from '@/lib/http/download-binary-proxy';
/** Exclusive byte range [start, end), matching yt-dlp FragmentFD / HlsFD. */
export type FragmentByteRange = { start: number; end: number };

export type FragmentPart = {
  url: string;
  duration?: number;
  filesize?: number;
  byteRange?: FragmentByteRange;
};

export function collectFragments(format: Format): FragmentPart[] {
  const frags = format.fragments;
  if (Array.isArray(frags) && frags.length) {
    return frags
      .map((f) => {
        const raw = f as {
          url?: string;
          duration?: number;
          filesize?: number;
          byte_range?: { start?: number; end?: number };
          byteRange?: { start?: number; end?: number };
        };
        const br = raw.byte_range || raw.byteRange;
        const byteRange =
          br &&
          typeof br.start === 'number' &&
          typeof br.end === 'number' &&
          br.end > br.start
            ? { start: br.start, end: br.end }
            : undefined;
        return {
          url: String(raw.url || ''),
          duration: typeof raw.duration === 'number' ? raw.duration : undefined,
          filesize: typeof raw.filesize === 'number' ? raw.filesize : undefined,
          byteRange,
        };
      })
      .filter((f) => /^https?:\/\//i.test(f.url));
  }
  return [];
}

async function withRetries<T>(
  fn: () => Promise<T>,
  retries: number,
  label: string,
): Promise<T> {
  let last: unknown;
  const max = Math.max(0, retries);
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt < max) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
    }
  }
  throw last instanceof Error ? last : new Error(`${label} failed: ${String(last)}`);
}

/** Download fragment URLs via Tauri `download_binary` and concat into one ArrayBuffer. */
export async function downloadFragmentsConcat(
  fragments: FragmentPart[],
  headers?: Record<string, string>,
  opts?: {
    concurrency?: number;
    /** Per-fragment HTTP retries (default 2) */
    retries?: number;
    onProgress?: (done: number, total: number, speed?: number) => void;
    decrypt?: (chunk: Uint8Array, index: number) => Promise<Uint8Array> | Uint8Array;
  },
): Promise<Uint8Array> {
  if (!fragments.length) throw new Error('No fragments to download');
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 4, 16));
  const retries = opts?.retries ?? 2;
  const chunks: Uint8Array[] = new Array(fragments.length);
  let done = 0;

  const fetchOne = async (index: number): Promise<void> => {
    const frag = fragments[index]!;
    const bytes = await withRetries(
      () => fetchBinary(frag.url, headers, frag.byteRange),
      retries,
      `fragment[${index}]`,
    );
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

function mergeRangeHeaders(
  headers?: Record<string, string>,
  byteRange?: FragmentByteRange,
): Record<string, string> {
  const out: Record<string, string> = { ...(headers || {}) };
  if (byteRange && byteRange.end > byteRange.start) {
    // yt-dlp: Range bytes=start-(end-1) with exclusive end
    out.Range = `bytes=${byteRange.start}-${byteRange.end - 1}`;
  }
  return out;
}

export async function fetchBinary(
  url: string,
  headers?: Record<string, string>,
  byteRange?: FragmentByteRange,
): Promise<Uint8Array> {
  const reqHeaders = mergeRangeHeaders(headers, byteRange);
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ data: number[]; status: number }>('download_binary', {
      url,
      method: 'GET',
      headers: reqHeaders,
      body: null,
      timeoutMs: 60000,
      useOkhttpUserAgent: false,
      ...downloadBinaryProxyArgs(),
    });
    // 200 / 206 Partial Content
    if (result.status >= 400) throw new Error(`HTTP ${result.status}`);
    return new Uint8Array(result.data);
  } catch (primary) {
    if (typeof fetch === 'function') {
      const res = await fetch(url, { headers: reqHeaders });
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
  opts?: {
    concurrency?: number;
    retries?: number;
    continuedl?: boolean;
    onProgress?: (done: number, total: number, speed?: number) => void;
  },
): Promise<string> {
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 4, 16));
  const hasRanges = fragments.some((f) => f.byteRange && f.byteRange.end > f.byteRange.start);
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    let unlisten: (() => void) | undefined;
    if (opts?.onProgress) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<{
          outputPath?: string;
          done?: number;
          total?: number;
          downloadedBytes?: number;
        }>('media-convert-fragment-progress', (event) => {
          const p = event.payload;
          if (p?.outputPath && p.outputPath !== outputPath) return;
          const bytes = Number(p?.downloadedBytes ?? 0);
          const fragDone = Number(p?.done ?? 0);
          const fragTotal = Number(p?.total ?? 0);
          // Prefer real bytes — never treat fragment counts as byte sizes
          if (bytes > 0) {
            const projected =
              fragTotal > 0 && fragDone > 0
                ? Math.max(bytes, Math.round(bytes / Math.max(fragDone / fragTotal, 0.001)))
                : bytes;
            opts.onProgress?.(bytes, projected);
            return;
          }
          if (fragTotal > 0 && fragDone >= 0) {
            // Ratio-only fallback (caller scales by filesize estimate)
            opts.onProgress?.(fragDone, fragTotal);
          }
        });
      } catch {
        /* non-Tauri / event unavailable */
      }
    }
    try {
      const r = await invoke<{ outputPath?: string }>('media_convert_fetch_fragments', {
        urls: fragments.map((f) => f.url),
        outputPath,
        headers: headers || null,
        concurrency,
        continuedl: opts?.continuedl ?? true,
        byteRanges: hasRanges
          ? fragments.map((f) =>
              f.byteRange && f.byteRange.end > f.byteRange.start
                ? { start: f.byteRange.start, end: f.byteRange.end }
                : null,
            )
          : null,
      });
      opts?.onProgress?.(fragments.length, fragments.length);
      return String(r?.outputPath || outputPath);
    } finally {
      try {
        unlisten?.();
      } catch {
        /* ignore */
      }
    }
  } catch {
    const bytes = await downloadFragmentsConcat(fragments, headers, {
      concurrency,
      retries: opts?.retries ?? 2,
      onProgress: opts?.onProgress,
    });
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      const { writeFile, mkdir } = await import('@tauri-apps/plugin-fs');
      const parent = outputPath.replace(/[/\\][^/\\]+$/, '');
      if (parent && parent !== outputPath) {
        try {
          await mkdir(parent, { recursive: true });
        } catch {
          /* exists */
        }
      }
      await writeFile(outputPath, bytes);
      return outputPath;
    } catch {
      if (bytes.byteLength > 4 * 1024 * 1024) {
        throw new Error('Fragment write requires Tauri media_convert_fetch_fragments or plugin-fs');
      }
      await invoke('write_binary_file', { path: outputPath, data: Array.from(bytes) });
      return outputPath;
    }
  }
}

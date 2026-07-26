/**
 * Seek 缩略图同源媒体：fetch/读盘 → blob: URL，供 <video>+canvas 抽帧。
 * 不依赖 mpv / libmpv。跨域 proxy 直链不能直接挂 video.src（会污染 canvas）。
 */

const MAX_BLOB_BYTES = 512 * 1024 * 1024;

type Entry = {
  promise: Promise<string>;
  abort?: AbortController;
  blobUrl?: string;
};

const byKey = new Map<string, Entry>();

export function revokeSeekThumbBlob(key: string): void {
  const e = byKey.get(key);
  if (!e) return;
  e.abort?.abort();
  if (e.blobUrl) URL.revokeObjectURL(e.blobUrl);
  byKey.delete(key);
}

export function clearAllSeekThumbBlobs(): void {
  for (const k of [...byKey.keys()]) revokeSeekThumbBlob(k);
}

/** 已落盘文件 → blob URL（会话内复用） */
export function ensureSeekThumbBlobFromBytes(
  key: string,
  bytes: ArrayBuffer,
  mime = 'video/mp4',
): string | null {
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_BLOB_BYTES) return null;
  const existing = byKey.get(key);
  if (existing?.blobUrl) return existing.blobUrl;

  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  byKey.set(key, { promise: Promise.resolve(blobUrl), blobUrl });
  return blobUrl;
}

/**
 * HTTP（含本机 proxy）：CORS fetch 成 blob（ACAO:* 下可读），再 blob: 同源抽帧。
 * 同一 key 只拉一次，可被边播边缓存完成后的本地文件覆盖注册。
 */
export function ensureSeekThumbBlobFromHttp(
  key: string,
  url: string,
  maxBytes = MAX_BLOB_BYTES,
): Promise<string> {
  const hit = byKey.get(key);
  if (hit) return hit.promise;

  const abort = new AbortController();
  const promise = (async () => {
    const res = await fetch(url, { signal: abort.signal, mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > maxBytes) {
      throw new Error(`media too large for in-memory seek thumb (${len}B)`);
    }
    const blob = await res.blob();
    if (blob.size > maxBytes) {
      throw new Error(`media too large for in-memory seek thumb (${blob.size}B)`);
    }
    const blobUrl = URL.createObjectURL(blob);
    const e = byKey.get(key);
    if (e) e.blobUrl = blobUrl;
    return blobUrl;
  })().catch((err) => {
    byKey.delete(key);
    throw err;
  });

  byKey.set(key, { promise, abort });
  return promise;
}

/** 本地路径读盘 → blob URL */
export async function ensureSeekThumbBlobFromLocalFile(
  key: string,
  filePath: string,
): Promise<string | null> {
  const hit = byKey.get(key);
  if (hit) return hit.promise;

  const promise = (async () => {
    const { getFileSystem } = await import('@/lib/platform/filesystem');
    const fs = await getFileSystem();
    const path = filePath.replace(/^file:\/\//i, '');
    const bytes = await fs.readFile(path);
    if (bytes.byteLength > MAX_BLOB_BYTES) {
      throw new Error(`local media too large for seek thumb blob (${bytes.byteLength}B)`);
    }
    const blobUrl = URL.createObjectURL(
      new Blob([bytes], { type: 'video/mp4' }),
    );
    const e = byKey.get(key);
    if (e) e.blobUrl = blobUrl;
    return blobUrl;
  })().catch((err) => {
    byKey.delete(key);
    throw err;
  });

  byKey.set(key, { promise });
  return promise;
}

/**
 * 本地曲目 → 可播放 URL
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { parseStorageRef } from '@/lib/platform/fs/storage-ref';
import { readBytes } from '@/lib/platform/fs/read-write';

const webBlobCache = new Map<string, string>();
const androidUriCache = new Map<string, string>();

function mimeFromPath(filePath: string): string {
  const ext = filePath.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? 'mp3';
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    wav: 'audio/wav',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
  };
  return map[ext] ?? 'audio/mpeg';
}

function localFilePath(track: AudioTrack): string {
  const androidUri = track.meta.androidUri ?? track.meta.contentUri;
  if (typeof androidUri === 'string' && androidUri.startsWith('content://')) {
    return androidUriCache.get(track.id) ?? androidUri;
  }
  const filePath = track.meta.filePath;
  if (!filePath) return '';
  if (filePath.startsWith('content://')) {
    return androidUriCache.get(track.id) ?? filePath;
  }
  return filePath;
}

function isManagedStoragePath(filePath: string): boolean {
  return (
    filePath.startsWith('opfs:') ||
    filePath.startsWith('handle:dir:') ||
    filePath.startsWith('handle:file:') ||
    filePath.startsWith('uri:') ||
    filePath.startsWith('virtual:') ||
    filePath.startsWith('saf-tree:')
  );
}

/** 同步解析（convertFileSrc）；需 tauri.conf assetProtocol 已启用 */
export function resolveLocalTrackUrl(track: AudioTrack): string {
  const filePath = localFilePath(track);
  if (!filePath) return '';
  if (isManagedStoragePath(filePath)) {
    return webBlobCache.get(track.id) ?? '';
  }
  if (isTauri()) {
    try {
      return convertFileSrc(filePath);
    } catch {
      return filePath;
    }
  }
  return webBlobCache.get(track.id) ?? '';
}

/**
 * 异步解析本地文件为可播放 URL。
 * Tauri 桌面优先 readFile → blob:；托管 StorageRef（OPFS/dir-handle/uri）走 readBytes。
 */
export async function resolveLocalTrackUrlAsync(
  track: AudioTrack,
): Promise<{ url: string; revoke: () => void }> {
  const filePath = localFilePath(track);
  if (!filePath) return { url: '', revoke: () => {} };

  if (isManagedStoragePath(filePath) || filePath.startsWith('content://')) {
    const cached = webBlobCache.get(track.id) ?? androidUriCache.get(track.id);
    if (cached?.startsWith('blob:')) {
      return { url: cached, revoke: () => {} };
    }
    try {
      const bytes = await readBytes(parseStorageRef(filePath));
      const blobUrl = URL.createObjectURL(
        new Blob([bytes], { type: mimeFromPath(filePath) }),
      );
      const prev = webBlobCache.get(track.id);
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      webBlobCache.set(track.id, blobUrl);
      if (filePath.startsWith('content://') || filePath.startsWith('uri:')) {
        androidUriCache.set(track.id, blobUrl);
      }
      return { url: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) };
    } catch (err) {
      console.warn('[music-local] managed readBytes failed', filePath, err);
      return { url: cached ?? '', revoke: () => {} };
    }
  }

  if (isTauri()) {
    console.info('[music-local] readFile start', {
      trackId: track.id,
      path: filePath.length > 96 ? `${filePath.slice(0, 96)}…` : filePath,
    });
    try {
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const bytes = await readFile(filePath);
      const blobUrl = URL.createObjectURL(
        new Blob([bytes], { type: mimeFromPath(filePath) }),
      );
      console.info('[music-local] readFile ok', {
        trackId: track.id,
        bytes: bytes.byteLength,
        mime: mimeFromPath(filePath),
      });
      return { url: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) };
    } catch (err) {
      console.warn('[music-local] readFile failed, fallback convertFileSrc', filePath, err);
      try {
        const url = convertFileSrc(filePath);
        return { url, revoke: () => {} };
      } catch {
        return { url: '', revoke: () => {} };
      }
    }
  }

  const cached = webBlobCache.get(track.id) ?? '';
  return { url: cached, revoke: () => {} };
}

export function registerWebTrackBlob(trackId: string, file: File): string {
  const prev = webBlobCache.get(trackId);
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(file);
  webBlobCache.set(trackId, url);
  return url;
}

/** Android SAF content:// URI → blob URL（WebView 内播放） */
export async function registerAndroidContentUri(
  trackId: string,
  uri: string,
): Promise<string> {
  if (!uri.startsWith('content://')) {
    androidUriCache.set(trackId, uri);
    return uri;
  }
  try {
    const res = await fetch(uri);
    if (!res.ok) {
      androidUriCache.set(trackId, uri);
      return uri;
    }
    const buf = await res.arrayBuffer();
    const prev = androidUriCache.get(trackId);
    if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
    const blobUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
    androidUriCache.set(trackId, blobUrl);
    return blobUrl;
  } catch {
    androidUriCache.set(trackId, uri);
    return uri;
  }
}

export function revokeWebTrackBlob(trackId: string): void {
  const url = webBlobCache.get(trackId);
  if (url) URL.revokeObjectURL(url);
  webBlobCache.delete(trackId);
  const androidUrl = androidUriCache.get(trackId);
  if (androidUrl?.startsWith('blob:')) URL.revokeObjectURL(androidUrl);
  androidUriCache.delete(trackId);
}

export function revokeAllWebTrackBlobs(): void {
  for (const url of webBlobCache.values()) {
    URL.revokeObjectURL(url);
  }
  webBlobCache.clear();
  for (const url of androidUriCache.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
  androidUriCache.clear();
}

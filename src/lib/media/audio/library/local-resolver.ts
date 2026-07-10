/**
 * 本地曲目 → 可播放 URL
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import type { AudioTrack } from '@/lib/media/audio/track-types';

const webBlobCache = new Map<string, string>();
const androidUriCache = new Map<string, string>();

export function resolveLocalTrackUrl(track: AudioTrack): string {
  const androidUri = track.meta.androidUri ?? track.meta.contentUri;
  if (typeof androidUri === 'string' && androidUri.startsWith('content://')) {
    return androidUriCache.get(track.id) ?? androidUri;
  }
  const filePath = track.meta.filePath;
  if (!filePath) return '';
  if (filePath.startsWith('content://')) {
    return androidUriCache.get(track.id) ?? filePath;
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

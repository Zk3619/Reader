/**
 * WebDAV 远程音频磁盘缓存（可选）
 * Tauri：Media/Audio/webdav-cache/{hash}.bin
 * Web：IndexedDB 简表
 */

import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';
import { resolveModuleMediaRoot } from '@/lib/media/media-root';

const CACHE_SUBDIR = 'webdav-cache';
const WEB_DB = 'reader-webdav-audio-cache-v1';
const WEB_STORE = 'files';

async function hashPath(path: string): Promise<string> {
  const enc = new TextEncoder().encode(path);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 40);
}

async function cacheDir(): Promise<string> {
  const root = await resolveModuleMediaRoot('music');
  return `${root.replace(/\/+$/, '')}/${CACHE_SUBDIR}`;
}

function openWebDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(WEB_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(WEB_STORE)) db.createObjectStore(WEB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readWebCache(key: string): Promise<ArrayBuffer | null> {
  const db = await openWebDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_STORE, 'readonly');
    const req = tx.objectStore(WEB_STORE).get(key);
    req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function writeWebCache(key: string, buf: ArrayBuffer): Promise<void> {
  const db = await openWebDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_STORE, 'readwrite');
    tx.objectStore(WEB_STORE).put(buf, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOrFetchWebDavAudioCache(
  webdavPath: string,
): Promise<{ urls: string[]; revokeAll: () => void } | null> {
  const key = await hashPath(webdavPath);
  const ext = webdavPath.split('.').pop()?.toLowerCase() ?? 'mp3';
  const mime =
    ext === 'flac'
      ? 'audio/flac'
      : ext === 'ogg'
        ? 'audio/ogg'
        : ext === 'm4a'
          ? 'audio/mp4'
          : 'audio/mpeg';

  let bytes: ArrayBuffer | null = null;

  if (isTauri()) {
    const fs = await getFileSystem();
    const dir = await cacheDir();
    const filePath = `${dir}/${key}.${ext}`;
    try {
      if (await fs.exists(filePath)) {
        bytes = await fs.readFile(filePath);
      }
    } catch {
      bytes = null;
    }
    if (!bytes) {
      const { createWebDavMusicClient } = await import(
        '@/lib/media/audio/library/webdav-remote-list'
      );
      const pair = await createWebDavMusicClient();
      if (!pair) return null;
      bytes = await pair.client.downloadFile(webdavPath);
      try {
        await fs.mkdir(dir, true);
        await fs.writeFile(filePath, bytes);
      } catch (err) {
        console.warn('[webdav-cache] write failed', err);
      }
    }
  } else {
    bytes = await readWebCache(key);
    if (!bytes) {
      const { createWebDavMusicClient } = await import(
        '@/lib/media/audio/library/webdav-remote-list'
      );
      const pair = await createWebDavMusicClient();
      if (!pair) return null;
      bytes = await pair.client.downloadFile(webdavPath);
      try {
        await writeWebCache(key, bytes);
      } catch {
        // ignore
      }
    }
  }

  if (!bytes) return null;
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  return {
    urls: [url],
    revokeAll: () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    },
  };
}

export async function clearWebDavAudioCache(): Promise<void> {
  if (isTauri()) {
    try {
      const fs = await getFileSystem();
      const dir = await cacheDir();
      if (await fs.exists(dir)) await fs.remove(dir, true);
    } catch (err) {
      console.warn('[webdav-cache] clear failed', err);
    }
    return;
  }
  try {
    const db = await openWebDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WEB_STORE, 'readwrite');
      tx.objectStore(WEB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

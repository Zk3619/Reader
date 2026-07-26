/**
 * 本地 seek 缩略图 SpriteStore：隐藏 video/canvas 抽帧 + 落盘雪碧图
 * 目录：{videoRoot}/seek-thumbs/{fingerprint}/sprite_n.jpg + index.json
 */

import { join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem } from '@/lib/platform/filesystem';
import { resolveModuleMediaRoot } from '@/lib/media/media-root';

export const SEEK_THUMB_INTERVAL_SEC = 5;
const TILE_W = 160;
const TILE_H = 90;
const COLS = 10;
const ROWS = 10;
const PER_SHEET = COLS * ROWS;
const SUBDIR = 'seek-thumbs';

export type SeekThumbPreview = {
  url: string;
  x: number;
  y: number;
  /** 单帧 dataURL（未写入雪碧图时） */
  single?: boolean;
};

type IndexJson = {
  interval: number;
  tileW: number;
  tileH: number;
  cols: number;
  rows: number;
  captured: number[];
};

function fingerprint(path: string): string {
  let h = 5381;
  for (let i = 0; i < path.length; i++) h = ((h << 5) + h + path.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

async function thumbsRoot(): Promise<string> {
  const base = await resolveModuleMediaRoot('video');
  const dir = await join(base, SUBDIR);
  const fs = await getFileSystem();
  if (!(await fs.exists(dir))) await fs.mkdir(dir, true);
  return dir;
}

async function entryDir(path: string): Promise<string> {
  return join(await thumbsRoot(), fingerprint(path));
}

async function loadIndex(dir: string): Promise<IndexJson> {
  const fs = await getFileSystem();
  const idx = await join(dir, 'index.json');
  if (!(await fs.exists(idx))) {
    return {
      interval: SEEK_THUMB_INTERVAL_SEC,
      tileW: TILE_W,
      tileH: TILE_H,
      cols: COLS,
      rows: ROWS,
      captured: [],
    };
  }
  try {
    const text = await fs.readTextFile(idx);
    const parsed = JSON.parse(text) as IndexJson;
    return {
      interval: parsed.interval || SEEK_THUMB_INTERVAL_SEC,
      tileW: parsed.tileW || TILE_W,
      tileH: parsed.tileH || TILE_H,
      cols: parsed.cols || COLS,
      rows: parsed.rows || ROWS,
      captured: Array.isArray(parsed.captured) ? parsed.captured : [],
    };
  } catch {
    return {
      interval: SEEK_THUMB_INTERVAL_SEC,
      tileW: TILE_W,
      tileH: TILE_H,
      cols: COLS,
      rows: ROWS,
      captured: [],
    };
  }
}

async function saveIndex(dir: string, index: IndexJson): Promise<void> {
  const fs = await getFileSystem();
  await fs.mkdir(dir, true);
  await fs.writeTextFile(await join(dir, 'index.json'), JSON.stringify(index));
}

/** 从已落盘雪碧图取预览；未命中返回 null */
export async function getSeekThumbFromStore(
  filePath: string,
  sec: number,
): Promise<SeekThumbPreview | null> {
  if (!isTauri()) return null;
  const path = filePath.trim();
  if (!path) return null;
  try {
    const dir = await entryDir(path);
    const fs = await getFileSystem();
    if (!(await fs.exists(dir))) return null;
    const index = await loadIndex(dir);
    const frame = Math.max(0, Math.floor(sec / index.interval));
    if (!index.captured.includes(frame)) return null;
    const sheet = Math.floor(frame / PER_SHEET);
    const cell = frame % PER_SHEET;
    const spritePath = await join(dir, `sprite_${sheet}.jpg`);
    if (!(await fs.exists(spritePath))) return null;
    return {
      url: convertFileSrc(spritePath),
      x: (cell % COLS) * TILE_W,
      y: Math.floor(cell / COLS) * TILE_H,
    };
  } catch {
    return null;
  }
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * 取单格缩略图（canvas）。雪碧图按 x/y 裁切，绝不返回整张 sheet URL，
 * 避免 UI 把完整雪碧图缩进预览框。
 */
export async function getSeekThumbTile(
  filePath: string,
  sec: number,
): Promise<{ canvas: HTMLCanvasElement } | { url: string } | null> {
  if (!isTauri()) return null;
  const path = filePath.trim();
  if (!path) return null;
  try {
    const dir = await entryDir(path);
    const fs = await getFileSystem();
    if (!(await fs.exists(dir))) return null;
    const index = await loadIndex(dir);
    const frame = Math.max(0, Math.floor(sec / index.interval));
    if (!index.captured.includes(frame)) return null;
    const sheet = Math.floor(frame / PER_SHEET);
    const cell = frame % PER_SHEET;
    const x = (cell % COLS) * TILE_W;
    const y = Math.floor(cell / COLS) * TILE_H;
    const spritePath = await join(dir, `sprite_${sheet}.jpg`);
    if (!(await fs.exists(spritePath))) return null;

    // 读盘 → blob URL，同源可安全裁切（避免 convertFileSrc 跨域）
    const bytes = await fs.readFile(spritePath);
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    try {
      const img = await loadImageFromUrl(blobUrl);
      if (!img || !img.naturalWidth) return null;
      const canvas = document.createElement('canvas');
      canvas.width = TILE_W;
      canvas.height = TILE_H;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return null;
      ctx.drawImage(img, x, y, TILE_W, TILE_H, 0, 0, TILE_W, TILE_H);
      return { canvas };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch {
    return null;
  }
}

/** 将一帧 JPEG dataURL 写入雪碧图对应格并更新索引 */
export async function putSeekThumbFrame(
  filePath: string,
  sec: number,
  dataUrl: string,
): Promise<SeekThumbPreview | null> {
  if (!isTauri()) return null;
  const path = filePath.trim();
  if (!path || !dataUrl.startsWith('data:image')) return null;
  try {
    const dir = await entryDir(path);
    const fs = await getFileSystem();
    await fs.mkdir(dir, true);
    const index = await loadIndex(dir);
    const frame = Math.max(0, Math.floor(sec / index.interval));
    const sheet = Math.floor(frame / PER_SHEET);
    const cell = frame % PER_SHEET;
    const spritePath = await join(dir, `sprite_${sheet}.jpg`);

    const atlas = document.createElement('canvas');
    atlas.width = COLS * TILE_W;
    atlas.height = ROWS * TILE_H;
    const actx = atlas.getContext('2d');
    if (!actx) return { url: dataUrl, x: 0, y: 0, single: true };

    if (await fs.exists(spritePath)) {
      // 用本地 bytes→blob URL，避免 convertFileSrc 跨域污染 atlas（toBlob 会 SecurityError）
      let blobUrl = '';
      try {
        const bytes = await fs.readFile(spritePath);
        blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
        const existing = await new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = blobUrl;
        });
        if (existing) actx.drawImage(existing, 0, 0);
      } finally {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      }
    }

    const tile = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
    if (!tile) return { url: dataUrl, x: 0, y: 0, single: true };

    const x = (cell % COLS) * TILE_W;
    const y = Math.floor(cell / COLS) * TILE_H;
    actx.drawImage(tile, x, y, TILE_W, TILE_H);

    const blob = await new Promise<Blob | null>((resolve) =>
      atlas.toBlob((b) => resolve(b), 'image/jpeg', 0.78),
    );
    if (!blob) return { url: dataUrl, x: 0, y: 0, single: true };
    const buf = await blob.arrayBuffer();
    await fs.writeFile(spritePath, buf);

    if (!index.captured.includes(frame)) {
      index.captured.push(frame);
      index.captured.sort((a, b) => a - b);
    }
    await saveIndex(dir, index);

    return {
      url: convertFileSrc(spritePath),
      x,
      y,
    };
  } catch (e) {
    console.warn('[sprite-store]', e);
    return { url: dataUrl, x: 0, y: 0, single: true };
  }
}

export async function getSeekThumbCacheStats(): Promise<{
  totalBytes: number;
  sheetCount: number;
  entryCount: number;
}> {
  if (!isTauri()) return { totalBytes: 0, sheetCount: 0, entryCount: 0 };
  try {
    const fs = await getFileSystem();
    const root = await thumbsRoot();
    if (!(await fs.exists(root))) return { totalBytes: 0, sheetCount: 0, entryCount: 0 };
    let totalBytes = 0;
    let sheetCount = 0;
    let entryCount = 0;
    for (const name of (await fs.readDir(root)) || []) {
      const dir = await join(root, name);
      entryCount += 1;
      for (const f of (await fs.readDir(dir)) || []) {
        if (!/\.jpe?g$/i.test(f) && f !== 'index.json') continue;
        try {
          const bytes = await fs.readFile(await join(dir, f));
          totalBytes += bytes.byteLength;
          if (/\.jpe?g$/i.test(f)) sheetCount += 1;
        } catch {
          /* */
        }
      }
    }
    return { totalBytes, sheetCount, entryCount };
  } catch {
    return { totalBytes: 0, sheetCount: 0, entryCount: 0 };
  }
}

export async function clearSeekThumbCache(): Promise<number> {
  if (!isTauri()) return 0;
  try {
    const fs = await getFileSystem();
    const root = await thumbsRoot();
    if (!(await fs.exists(root))) return 0;
    let n = 0;
    for (const name of (await fs.readDir(root)) || []) {
      try {
        await fs.remove(await join(root, name), true);
        n += 1;
      } catch {
        /* */
      }
    }
    return n;
  } catch {
    return 0;
  }
}

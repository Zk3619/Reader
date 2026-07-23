/**
 * 本地视频 seek 缩略图：优先 HTML video+canvas；失败再走 mpv 抽帧
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { invoke } from '@tauri-apps/api/core';

const cache = new Map<string, string>();

function cacheKey(path: string, sec: number): string {
  return `${path}#${Math.floor(sec)}`;
}

function isLocalPath(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (/^https?:\/\//i.test(u) || /^blob:/i.test(u) || /^data:/i.test(u)) return false;
  if (u.startsWith('file://')) return true;
  // Windows / Unix 绝对路径
  return /^[a-zA-Z]:[\\/]/.test(u) || u.startsWith('/') || u.startsWith('\\\\');
}

export function isLocalSeekThumbSource(url: string): boolean {
  return isLocalPath(url);
}

async function grabViaCanvas(path: string, sec: number): Promise<string | null> {
  const src = path.startsWith('file://') ? path : convertFileSrc(path);
  return await new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    let settled = false;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      video.removeAttribute('src');
      video.load();
      resolve(v);
    };
    const timer = window.setTimeout(() => done(null), 4000);
    video.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    video.onloadeddata = () => {
      try {
        const t = Math.max(0, Math.min(sec, (video.duration || sec) - 0.05));
        video.currentTime = t;
      } catch {
        window.clearTimeout(timer);
        done(null);
      }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = Math.min(320, video.videoWidth || 320);
        const h = Math.round(
          ((video.videoHeight || 180) / Math.max(1, video.videoWidth || 320)) * w,
        );
        canvas.width = w;
        canvas.height = h || 180;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          window.clearTimeout(timer);
          done(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        window.clearTimeout(timer);
        done(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        window.clearTimeout(timer);
        done(null);
      }
    };
    video.src = src;
  });
}

async function grabViaMpv(path: string, sec: number): Promise<string | null> {
  try {
    const b64 = await invoke<string>('video_extract_thumbnail', { path, sec });
    if (!b64) return null;
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return null;
  }
}

/** 返回 data URL；失败返回 null */
export async function getLocalSeekThumbnail(
  path: string,
  sec: number,
): Promise<string | null> {
  const key = cacheKey(path, sec);
  const hit = cache.get(key);
  if (hit) return hit;
  const viaCanvas = await grabViaCanvas(path, sec);
  if (viaCanvas) {
    cache.set(key, viaCanvas);
    return viaCanvas;
  }
  const viaMpv = await grabViaMpv(path.replace(/^file:\/\//i, ''), sec);
  if (viaMpv) {
    cache.set(key, viaMpv);
    return viaMpv;
  }
  return null;
}

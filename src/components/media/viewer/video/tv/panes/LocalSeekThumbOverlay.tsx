/**
 * Seek 缩略图叠层：滑动只动 DOM + 缓存帧（不抽帧，避免与正片抢解码器）；
 * 停手后再 Range 抽一帧写入缓存。
 */

import { onCleanup, createEffect } from 'solid-js';
import type { Accessor } from 'solid-js';
import type Artplayer from 'artplayer';
import {
  beginSeekThumbHover,
  cancelSeekThumbDecode,
  captureSeekThumbFromPlayingVideo,
  endSeekThumbHover,
  hydrateSeekThumbFromStore,
  isLocalSeekThumbSource,
  peekSeekThumbCached,
  requestSeekThumbDecode,
  type LocalSeekThumbResult,
} from '@/lib/media/video/playback/local-thumb';
import { formatArtProgressTime } from '@/lib/media/video/artplayer/progress-preview';

const TILE_W = 160;
const TILE_H = 90;
/** 停手多久后才允许二次 video 抽帧 */
const SETTLE_MS = 140;

function ensureThumbShell($progress: HTMLElement): {
  root: HTMLElement;
  frame: HTMLElement;
  time: HTMLElement;
  canvas: HTMLCanvasElement;
} {
  let root = $progress.querySelector<HTMLElement>('.reader-local-seek-thumb');
  if (!root) {
    root = document.createElement('div');
    root.className = 'art-control-thumbnails reader-local-seek-thumb';
    root.style.display = 'none';
    root.setAttribute('aria-hidden', 'true');

    const frame = document.createElement('div');
    frame.className = 'reader-local-seek-frame';
    frame.style.width = `${TILE_W}px`;
    frame.style.height = `${TILE_H}px`;
    root.appendChild(frame);

    const canvas = document.createElement('canvas');
    canvas.width = TILE_W;
    canvas.height = TILE_H;
    canvas.style.width = `${TILE_W}px`;
    canvas.style.height = `${TILE_H}px`;
    canvas.style.display = 'block';
    frame.appendChild(canvas);

    const time = document.createElement('div');
    time.className = 'reader-thumb-time';
    root.appendChild(time);

    $progress.appendChild(root);
    return { root, frame, time, canvas };
  }
  const frame =
    root.querySelector<HTMLElement>('.reader-local-seek-frame') ??
    (() => {
      const f = document.createElement('div');
      f.className = 'reader-local-seek-frame';
      root!.prepend(f);
      return f;
    })();
  let canvas = frame.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = TILE_W;
    canvas.height = TILE_H;
    canvas.style.width = `${TILE_W}px`;
    canvas.style.height = `${TILE_H}px`;
    canvas.style.display = 'block';
    frame.replaceChildren(canvas);
  }
  let time = root.querySelector<HTMLElement>('.reader-thumb-time');
  if (!time) {
    time = document.createElement('div');
    time.className = 'reader-thumb-time';
    root.appendChild(time);
  }
  return { root, frame, time, canvas };
}

function placeThumb(root: HTMLElement, $progress: HTMLElement, x: number): void {
  const trackW = $progress.clientWidth;
  const w = root.offsetWidth || TILE_W;
  let left = x - w / 2;
  if (left < 0) left = 0;
  if (left + w > trackW) left = Math.max(0, trackW - w);
  root.style.left = `${left}px`;
}

function paintInto(
  shell: { frame: HTMLElement; canvas: HTMLCanvasElement },
  r: LocalSeekThumbResult,
): void {
  const { frame, canvas } = shell;
  // 统一只画单格到 canvas，禁止 backgroundImage 挂整张雪碧图
  frame.style.backgroundImage = '';
  frame.style.backgroundPosition = '';
  frame.style.backgroundSize = '';
  canvas.style.display = 'block';

  if (r.canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) ctx.drawImage(r.canvas, 0, 0, TILE_W, TILE_H);
    return;
  }
  if (r.url?.startsWith('data:image')) {
    const img = new Image();
    img.onload = () => {
      // 防御：若误存了整张 sheet（宽远大于一格），只取左上角一格
      const sx = 0;
      const sy = 0;
      const sw = Math.min(TILE_W, img.naturalWidth || TILE_W);
      const sh = Math.min(TILE_H, img.naturalHeight || TILE_H);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TILE_W, TILE_H);
    };
    img.src = r.url;
    return;
  }
  // 忽略 sprite 整图 URL / 其它非单帧源，保留上一帧
}

export function LocalSeekThumbOverlay(props: {
  art: Accessor<Artplayer | null>;
  localPath: Accessor<string>;
  spriteKey?: Accessor<string>;
}) {
  let raf = 0;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let requestToken = 0;
  let lastPaintBucket = -1;
  let hasFrame = false;
  let hovering = false;
  let pendingPct: number | null = null;
  let shell: ReturnType<typeof ensureThumbShell> | null = null;
  let detachArt: (() => void) | undefined;
  let lastSourceKey = '';
  let hoverArmed = false;

  const armHover = () => {
    if (!hoverArmed) {
      hoverArmed = true;
      beginSeekThumbHover();
    }
  };
  const disarmHover = () => {
    if (hoverArmed) {
      hoverArmed = false;
      endSeekThumbHover();
    }
  };

  const hide = () => {
    hovering = false;
    pendingPct = null;
    requestToken += 1;
    lastPaintBucket = -1;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = undefined;
    }
    cancelSeekThumbDecode();
    disarmHover();
    if (shell) {
      shell.root.classList.remove('reader-thumb-visible');
      shell.root.style.display = 'none';
    }
  };

  const showShell = () => {
    if (!shell) return;
    shell.root.style.display = 'flex';
    shell.root.classList.add('reader-thumb-visible');
    shell.root.parentElement
      ?.querySelector('.reader-progress-hover-tip')
      ?.classList.remove('is-visible');
  };

  const applyFrame = (r: LocalSeekThumbResult, token: number) => {
    if (token !== requestToken || !shell || !hovering) return;
    paintInto(shell, r);
    hasFrame = true;
    showShell();
  };

  const scheduleDecode = (path: string, sec: number, spriteKey: string | undefined, token: number) => {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = undefined;
      if (token !== requestToken || !hovering) return;
      requestSeekThumbDecode({
        path,
        sec,
        spriteKey,
        onFrame: (r) => applyFrame(r, token),
      });
    }, SETTLE_MS);
  };

  const flushHover = () => {
    raf = 0;
    const pct = pendingPct;
    pendingPct = null;
    if (pct == null) return;

    const art = props.art();
    const path = props.localPath().trim();
    if (!art || !isLocalSeekThumbSource(path)) {
      hide();
      return;
    }
    const $progress = art.template?.$progress;
    if (!$progress) return;
    const trackW = $progress.clientWidth;
    const dur = Number(art.duration) || 0;
    if (!trackW || !(dur > 0) || pct <= 0 || pct >= 1) {
      hide();
      return;
    }

    shell = ensureThumbShell($progress);
    armHover();
    hovering = true;
    const x = trackW * pct;
    const sec = pct * dur;
    const spriteKey = props.spriteKey?.().trim() || path;

    // 滑动中：立刻取消抽帧，把解码器还给正片
    cancelSeekThumbDecode();

    shell.time.textContent = formatArtProgressTime(sec);
    placeThumb(shell.root, $progress, x);
    showShell();

    const bucket = Math.floor(sec);
    // 先占新 token：本轮 hydrate / decode 共用，下一轮滑动会作废
    const roundToken = ++requestToken;
    if (bucket !== lastPaintBucket || !hasFrame) {
      lastPaintBucket = bucket;
      const fromMain = captureSeekThumbFromPlayingVideo(
        art.video as HTMLVideoElement | undefined,
        sec,
        spriteKey,
      );
      const cached = fromMain || peekSeekThumbCached(spriteKey, sec);
      if (cached) {
        applyFrame(cached, roundToken);
      } else {
        void hydrateSeekThumbFromStore(spriteKey, sec).then((r) => {
          if (!r) return;
          applyFrame(r, roundToken);
        });
      }
    }

    scheduleDecode(path, sec, props.spriteKey?.().trim(), roundToken);
  };

  const onHoverBar = (percentage: number) => {
    pendingPct = percentage;
    if (!raf) raf = requestAnimationFrame(flushHover);
  };

  const bindArt = (art: Artplayer | null) => {
    detachArt?.();
    detachArt = undefined;
    if (!art) return;

    const onSetBar = (type: string, percentage: number) => {
      if (type !== 'hover') return;
      onHoverBar(percentage);
    };
    const onHover = (state: boolean) => {
      if (!state) hide();
    };
    const $progress = art.template?.$progress;
    const onLeave = () => hide();

    art.on('setBar', onSetBar);
    art.on('hover', onHover);
    $progress?.addEventListener('mouseleave', onLeave);

    detachArt = () => {
      art.off('setBar', onSetBar);
      art.off('hover', onHover);
      $progress?.removeEventListener('mouseleave', onLeave);
      hide();
      shell?.root.remove();
      shell = null;
      hasFrame = false;
    };
  };

  createEffect(() => {
    const art = props.art();
    const key = props.spriteKey?.()?.trim() || props.localPath().trim();
    props.localPath();
    if (key !== lastSourceKey) {
      lastSourceKey = key;
      hasFrame = false;
      lastPaintBucket = -1;
    }
    bindArt(art);
  });

  onCleanup(() => {
    if (raf) cancelAnimationFrame(raf);
    if (settleTimer) clearTimeout(settleTimer);
    detachArt?.();
    disarmHover();
  });

  return null;
}

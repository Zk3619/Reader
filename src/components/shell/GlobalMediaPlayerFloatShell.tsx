/**
 * 全局播放窗 · 悬浮壳
 * 自由拖拽；默认靠底居中；贴边松手吸附并走与收起按钮相同的 collapsed。
 * 展开坐标会推离贴边阈值，避免恢复贴边位后「看不见 / 一碰又收起」。
 */

import { createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import {
  clampGmpFloatPos,
  defaultGmpFloatPos,
  detectGmpFloatEdge,
  normalizeMediaPlayerFloat,
  nudgeGmpFloatOffEdge,
  snapGmpFloatToEdge,
  type GmpFloatEdge,
  type GmpFloatPos,
} from '@/lib/viewer/global-media-player-float-pos';
import { setGmpFloatLive, clearGmpFloatLiveSignal } from '@/lib/viewer/gmp-float-live';
import { settingsState, settingsStore } from '@/stores/settings';

const DRAG_THRESHOLD_PX = 5;
/** 贴边自动收起要求拖拽超过该距离，避免误触 */
const EDGE_COLLAPSE_MIN_DRAG_PX = 28;
const FALLBACK_W = 360;
const FALLBACK_H = 72;

function canStartDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !target.closest('[data-no-drag]');
}

function resolveInitialPos(width: number, height: number): GmpFloatPos {
  const stored = normalizeMediaPlayerFloat(settingsState.app.mediaPlayerFloat);
  if (!stored) return defaultGmpFloatPos(width, height);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const mostlyOff =
    stored.left + width < 8 ||
    stored.left > vw - 8 ||
    stored.top + height < 8 ||
    stored.top > vh - 8;
  if (mostlyOff) return defaultGmpFloatPos(width, height);
  // 推离贴边阈值；不恢复 edge 收起态
  return nudgeGmpFloatOffEdge(
    clampGmpFloatPos(stored.left, stored.top, width, height),
    width,
    height,
  );
}

export function GlobalMediaPlayerFloatShell(props: {
  class?: string;
  zClass: string;
  children: JSX.Element;
  /** 贴边松手后回调（与收起按钮同一收起路径） */
  onEdgeCollapse?: (edge: Exclude<GmpFloatEdge, 'none'>) => void;
}) {
  const boot = resolveInitialPos(FALLBACK_W, FALLBACK_H);
  const [pos, setPos] = createSignal<GmpFloatPos>(boot);
  const [dragging, setDragging] = createSignal(false);
  let shellEl: HTMLDivElement | undefined;

  const sizeOf = (el: HTMLDivElement) => ({
    width: el.offsetWidth || FALLBACK_W,
    height: el.offsetHeight || FALLBACK_H,
  });

  const publish = (next: GmpFloatPos, nextEdge: GmpFloatEdge, width: number, height: number) => {
    setPos(next);
    setGmpFloatLive({ pos: next, edge: nextEdge, width, height });
  };

  onMount(() => {
    const el = shellEl;
    if (!el) return;
    const { width, height } = sizeOf(el);
    const next = resolveInitialPos(width, height);
    publish(next, 'none', width, height);
    const stored = normalizeMediaPlayerFloat(settingsState.app.mediaPlayerFloat);
    if (
      !stored ||
      Math.round(stored.left) !== Math.round(next.left) ||
      Math.round(stored.top) !== Math.round(next.top) ||
      stored.edge !== 'none'
    ) {
      void settingsStore.setMediaPlayerFloat({
        left: next.left,
        top: next.top,
        edge: 'none',
      });
    }
  });

  onCleanup(() => clearGmpFloatLiveSignal());

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (!canStartDrag(e.target)) return;
    const el = shellEl;
    if (!el) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const origin = pos();
    let moved = false;
    let dragDist = 0;
    let active = true;

    const onMove = (ev: PointerEvent) => {
      if (!active) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      dragDist = Math.hypot(dx, dy);
      if (!moved) {
        if (dragDist < DRAG_THRESHOLD_PX) return;
        moved = true;
        setDragging(true);
        try {
          el.setPointerCapture(ev.pointerId);
        } catch {
          /* */
        }
      }
      ev.preventDefault();
      const { width, height } = sizeOf(el);
      const next = clampGmpFloatPos(origin.left + dx, origin.top + dy, width, height);
      publish(next, 'none', width, height);
    };

    const onUp = (ev: PointerEvent) => {
      if (!active) return;
      active = false;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      try {
        if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
      } catch {
        /* */
      }
      if (moved) {
        const { width, height } = sizeOf(el);
        const cur = pos();
        const nextEdge = detectGmpFloatEdge(cur.left, cur.top, width, height);
        const snapped = snapGmpFloatToEdge(cur, nextEdge, width, height);
        publish(snapped, nextEdge, width, height);
        void settingsStore.setMediaPlayerFloat({
          left: snapped.left,
          top: snapped.top,
          edge: nextEdge,
        });
        // 仅明显拖拽后的贴边才自动收起，避免点击抖动误收起后「窗体丢失」
        if (nextEdge !== 'none' && dragDist >= EDGE_COLLAPSE_MIN_DRAG_PX) {
          props.onEdgeCollapse?.(nextEdge);
        }
        const swallow = (ce: Event) => {
          ce.preventDefault();
          ce.stopPropagation();
        };
        el.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => el.removeEventListener('click', swallow, true), 0);
      }
      setDragging(false);
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  };

  return (
    <div
      ref={(el) => {
        shellEl = el;
      }}
      class={cn(
        'fixed',
        dragging() ? 'cursor-grabbing' : 'cursor-grab',
        props.zClass,
        props.class,
      )}
      style={{
        left: `${Math.round(pos().left)}px`,
        top: `${Math.round(pos().top)}px`,
        right: 'auto',
        bottom: 'auto',
        transform: 'none',
      }}
      role="region"
      aria-label="媒体播放控制"
      onPointerDown={onPointerDown}
    >
      {props.children}
    </div>
  );
}

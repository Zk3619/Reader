/**
 * 发现页简介：flex 占满剩余高度后，按可用行数设置 line-clamp，末行 … 省略。
 */

import { onCleanup, onMount, type JSX } from 'solid-js';
import { discoverBookListIntroClass, discoverBookListIntroWrapClass } from '@/lib/bookshelf/book-group-card-styles';

export function DiscoverBookListIntro(props: { children: JSX.Element }) {
  let wrap: HTMLDivElement | undefined;
  let intro: HTMLParagraphElement | undefined;

  function syncLineClamp() {
    const w = wrap;
    const p = intro;
    if (!w || !p) return;
    const h = w.clientHeight;
    if (h <= 0) return;
    const lhRaw = getComputedStyle(p).lineHeight;
    const lh = parseFloat(lhRaw);
    const lineHeight = Number.isFinite(lh) && lh > 0 ? lh : 20;
    const n = Math.max(1, Math.floor((h - 2) / lineHeight));
    p.style.setProperty('--discover-intro-line-clamp', String(n));
  }

  onMount(() => {
    const w = wrap;
    if (!w || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => requestAnimationFrame(syncLineClamp));
    ro.observe(w);
    requestAnimationFrame(() => {
      syncLineClamp();
      requestAnimationFrame(syncLineClamp);
    });
    onCleanup(() => ro.disconnect());
  });

  return (
    <div ref={(el) => (wrap = el)} class={discoverBookListIntroWrapClass()}>
      <p ref={(el) => (intro = el)} class={discoverBookListIntroClass()}>
        {props.children}
      </p>
    </div>
  );
}

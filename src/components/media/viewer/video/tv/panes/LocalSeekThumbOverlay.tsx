/**
 * Artplayer 本地片源：进度条悬停预览帧
 */

import { createSignal, Show, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import type Artplayer from 'artplayer';
import {
  getLocalSeekThumbnail,
  isLocalSeekThumbSource,
} from '@/lib/media/video/playback/local-thumb';

export function LocalSeekThumbOverlay(props: {
  art: Accessor<Artplayer | null>;
  localPath: Accessor<string>;
}) {
  const [preview, setPreview] = createSignal<{
    url: string;
    left: number;
    sec: number;
  } | null>(null);
  let pending = 0;

  const onMove = (ev: MouseEvent) => {
    const art = props.art();
    const path = props.localPath().trim();
    if (!art || !isLocalSeekThumbSource(path)) {
      setPreview(null);
      return;
    }
    const root = art.template?.$progress as HTMLElement | undefined;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width);
    const ratio = x / rect.width;
    const dur = Number(art.duration) || 0;
    if (!(dur > 0)) return;
    const sec = ratio * dur;
    const left = rect.left + x;
    const token = ++pending;
    void getLocalSeekThumbnail(path, sec).then((url) => {
      if (token !== pending || !url) return;
      setPreview({ url, left, sec });
    });
  };

  const onLeave = () => {
    pending += 1;
    setPreview(null);
  };

  const bind = () => {
    const art = props.art();
    const el = art?.template?.$progress as HTMLElement | undefined;
    if (!el) return () => {};
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  };

  let unbind = () => {};
  const timer = window.setInterval(() => {
    unbind();
    unbind = bind();
  }, 800);
  unbind = bind();
  onCleanup(() => {
    window.clearInterval(timer);
    unbind();
  });

  return (
    <Show when={preview()}>
      {(p) => (
        <div
          class="pointer-events-none fixed z-[80] -translate-x-1/2 rounded border border-border bg-background/95 p-1 shadow-md"
          style={{
            left: `${p().left}px`,
            bottom: '96px',
          }}
        >
          <img src={p().url} alt="" class="h-20 w-auto max-w-[160px] rounded object-cover" />
          <p class="mt-0.5 text-center text-[10px] text-muted-foreground">
            {Math.floor(p().sec / 60)}:{String(Math.floor(p().sec % 60)).padStart(2, '0')}
          </p>
        </div>
      )}
    </Show>
  );
}

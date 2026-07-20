/**
 * 影视 Hub 全屏壁纸层（对齐 fongmi CustomWallView 子集）
 * follow：不绘制，交给主程序 / module.tv 主题
 * builtin 1–4：内置色板；url/local：缓存图 / GIF / 视频
 */

import { Show } from 'solid-js';
import {
  getTvWallUi,
  TV_BUILTIN_WALL_COLORS,
} from '@/stores/tv-hub/tv-wall-ui';
import { cn } from '@/lib/utils';

export function TvWallBackdrop() {
  const ui = getTvWallUi;
  const active = () => ui().mode !== 'follow';

  return (
    <Show when={active()}>
      <div
        class="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        aria-hidden
        data-tv-wall-revision={ui().revision}
      >
        <Show when={ui().mode === 'builtin' && ui().wall >= 1 && ui().wall <= 4}>
          <div
            class="absolute inset-0"
            style={{
              background: `radial-gradient(120% 80% at 20% 10%, ${TV_BUILTIN_WALL_COLORS[ui().wall]}cc 0%, ${TV_BUILTIN_WALL_COLORS[ui().wall]} 45%, #0a0a0acc 100%)`,
            }}
          />
        </Show>
        <Show when={(ui().mode === 'url' || ui().mode === 'local') && !!ui().displaySrc}>
          <Show when={ui().wallType === 2}>
            <video
              class="absolute inset-0 h-full w-full object-cover"
              src={ui().displaySrc}
              muted
              loop
              autoplay
              playsinline
            />
          </Show>
          <Show when={ui().wallType !== 2}>
            <img
              class={cn('absolute inset-0 h-full w-full object-cover')}
              src={ui().displaySrc}
              alt=""
              draggable={false}
            />
          </Show>
        </Show>
        <div class="absolute inset-0 bg-linear-to-b from-background/25 via-transparent to-background/40" />
      </div>
    </Show>
  );
}

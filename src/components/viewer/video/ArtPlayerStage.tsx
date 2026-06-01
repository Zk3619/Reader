/**
 * ArtPlayer 舞台：全屏黑底 + 加载/错误 + 播放器挂载点
 */

import { Show, type Accessor } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ArtPlayerStageProps {
  containerRef: (el: HTMLDivElement) => void;
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  hasSrc: Accessor<boolean>;
  overlayTip: Accessor<string | null>;
  onRetry?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
  onDblClick?: () => void;
  class?: string;
}

export function ArtPlayerStage(props: ArtPlayerStageProps) {
  return (
    <div
      class={cn(
        'reader-artplayer-stage relative h-full w-full overflow-hidden bg-black',
        props.class,
      )}
      onPointerDown={props.onPointerDown}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      onPointerLeave={props.onPointerCancel}
      onDblClick={props.onDblClick}
    >
      <div
        ref={props.containerRef}
        class={cn(
          'absolute inset-0',
          props.loading() || props.error() ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
      />

      <Show when={props.loading()}>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div class="h-10 w-10 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-400" />
          <p class="text-sm text-white/70">正在解析视频地址…</p>
        </div>
      </Show>

      <Show when={!props.loading() && props.error()}>
        <div class="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p class="max-w-md text-sm text-red-400">{props.error()}</p>
          <Show when={props.onRetry}>
            <Button class="mt-4" size="sm" variant="outline" onClick={props.onRetry}>
              重试
            </Button>
          </Show>
        </div>
      </Show>

      <Show when={props.overlayTip()}>
        <div class="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex justify-center">
          <span class="rounded-lg border border-violet-400/30 bg-black/75 px-4 py-2 text-sm text-violet-100 backdrop-blur-sm">
            {props.overlayTip()}
          </span>
        </div>
      </Show>
    </div>
  );
}

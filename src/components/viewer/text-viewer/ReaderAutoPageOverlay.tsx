import { Show } from 'solid-js';
import { cn } from '@/lib/utils';
import type {
  TextViewerAutoPageProgressEdge,
  TextViewerAutoPageStyle,
} from '@/lib/media/text/reader-ui-config';

export interface ReaderAutoPageOverlayProps {
  visible: boolean;
  style: TextViewerAutoPageStyle;
  progressEdge: TextViewerAutoPageProgressEdge;
  /** 0–1：当前屏翻页进度 */
  progress: number;
  class?: string;
}

/** 自动翻页进度指示（揭示下一页由 ReaderPagedViewport 纵向 clip 绘制扫描线） */
export function ReaderAutoPageOverlay(props: ReaderAutoPageOverlayProps) {
  const progress = () => Math.min(1, Math.max(0, props.progress));
  const showChrome = () => props.visible && props.style !== 'reveal';
  const lineTopPercent = () => progress() * 100;
  const barWidthPercent = () => progress() * 100;

  return (
    <Show when={showChrome()}>
      <div
        class={cn('pointer-events-none absolute inset-0 z-20 overflow-hidden', props.class)}
        aria-hidden
      >
        <Show when={props.style === 'scanLine'}>
          <div
            class="absolute left-0 right-0 h-0.5 bg-primary shadow-sm"
            style={{ top: `${lineTopPercent()}%` }}
          />
        </Show>
        <Show when={props.style === 'progressBar'}>
          <div
            class={cn(
              'absolute inset-x-0 px-3',
              props.progressEdge === 'top' ? 'top-2' : 'bottom-2',
            )}
          >
            <div class="h-1 overflow-hidden rounded-full bg-muted/60">
              <div
                class="h-full rounded-full bg-primary transition-[width] duration-75 ease-linear"
                style={{ width: `${barWidthPercent()}%` }}
              />
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}

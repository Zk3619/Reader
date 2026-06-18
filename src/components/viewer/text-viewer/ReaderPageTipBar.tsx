import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { cn } from '@/lib/utils';
import type { TextViewerPageTipsConfig } from '@/lib/media/text/reader-ui-config';
import {
  readerPageTipBarVisible,
  readerPageTipBarEdgePaddingStyle,
  readerPageTipsUseBattery,
  readerPageTipsUseTime,
  readerPageTipSlotValue,
  resolveReaderPageTipText,
  refreshReaderBatteryLevel,
  type ReaderPageTipContext,
} from '@/lib/media/text/reader-page-tip';

export interface ReaderPageTipBarProps {
  position: 'header' | 'footer';
  tips: TextViewerPageTipsConfig;
  context: ReaderPageTipContext;
  chromeBarsVisible: boolean;
  contentColor?: string;
  class?: string;
}

function slotKey(position: 'header' | 'footer', col: 'Left' | 'Middle' | 'Right') {
  return `${position}${col}` as const;
}

export function ReaderPageTipBar(props: ReaderPageTipBarProps) {
  createEffect(() => {
    if (!readerPageTipsUseBattery(props.tips)) return;
    refreshReaderBatteryLevel();
    const timer = window.setInterval(refreshReaderBatteryLevel, 60_000);
    onCleanup(() => window.clearInterval(timer));
  });

  const [timeTick, setTimeTick] = createSignal(0);
  createEffect(() => {
    if (!readerPageTipsUseTime(props.tips)) return;
    const timer = window.setInterval(() => setTimeTick((n) => n + 1), 60_000);
    onCleanup(() => window.clearInterval(timer));
  });

  const visible = () =>
    readerPageTipBarVisible(props.position, props.tips, props.chromeBarsVisible);

  const inset = () =>
    props.position === 'header' ? props.tips.headerInset : props.tips.footerInset;

  const fontSize = () =>
    props.position === 'header' ? props.tips.headerFontSize : props.tips.footerFontSize;

  const showLine = () =>
    props.position === 'header' ? props.tips.showHeaderLine : props.tips.showFooterLine;

  const textColor = () =>
    props.tips.tipFollowContentColor
      ? props.contentColor
      : props.tips.customTipColor || props.contentColor;

  const cellText = (col: 'Left' | 'Middle' | 'Right') => {
    void timeTick();
    const key = slotKey(props.position, col);
    const type = readerPageTipSlotValue(props.tips, key);
    return resolveReaderPageTipText(type, props.context);
  };

  return (
    <Show when={visible()}>
      <div
        class={cn(
          'reader-page-tip pointer-events-none w-full shrink-0 select-none',
          props.position === 'header' ? 'reader-page-tip-header' : 'reader-page-tip-footer',
          props.class,
        )}
        style={{
          ...readerPageTipBarEdgePaddingStyle(props.position, inset()),
          color: textColor(),
          'font-size': `${fontSize()}px`,
          'line-height': '1.35',
          'background-color': 'inherit',
        }}
        aria-hidden="true"
      >
        <Show when={showLine() && props.position === 'footer'}>
          <div
            class="mb-1 h-px w-full opacity-30"
            style={{ 'background-color': textColor() ?? 'currentColor' }}
          />
        </Show>
        <div class="grid min-w-0 grid-cols-3 items-center gap-1 tabular-nums">
          <span class="min-w-0 truncate text-left">{cellText('Left')}</span>
          <span class="min-w-0 truncate text-center">{cellText('Middle')}</span>
          <span class="min-w-0 truncate text-right">{cellText('Right')}</span>
        </div>
        <Show when={showLine() && props.position === 'header'}>
          <div
            class="mt-1 h-px w-full opacity-30"
            style={{ 'background-color': textColor() ?? 'currentColor' }}
          />
        </Show>
      </div>
    </Show>
  );
}

/** 时间类 tip 每分钟刷新 */
export function ReaderPageTipClockTicker(props: { onTick: () => void }) {
  createEffect(() => {
    const timer = window.setInterval(() => props.onTick(), 60_000);
    onCleanup(() => window.clearInterval(timer));
  });
  return null;
}

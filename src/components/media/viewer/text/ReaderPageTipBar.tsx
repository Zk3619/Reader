import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { cn } from '@/lib/utils';
import type { TextViewerPageTipsConfig } from '@/lib/media/text/reader-ui-config';
import {
  readerPageTipBarEdgePaddingStyle,
  readerPageTipBarVisibleOnSurface,
  readerPageTipsUseBattery,
  readerPageTipsUseTime,
  readerPageTipSlotValue,
  resolveReaderPageTipText,
  refreshReaderBatteryLevel,
  type ReaderPageTipBarSurface,
  type ReaderPageTipContext,
} from '@/lib/media/text/reader-page-tip';
import { resolveTextViewerPageTipPresentation } from '@/lib/theme/TextViewerTheme';
import { textViewerStore } from '@/stores/viewer';

export interface ReaderPageTipBarProps {
  position: 'header' | 'footer';
  tips: TextViewerPageTipsConfig;
  context: ReaderPageTipContext;
  chromeBarsVisible: boolean;
  themeId: number;
  /** reader=阅读器内；chrome=顶/底操作栏（跟随模式） */
  surface?: ReaderPageTipBarSurface;
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

  const surface = () => props.surface ?? 'reader';

  const visible = () =>
    readerPageTipBarVisibleOnSurface(
      props.position,
      props.tips,
      props.chromeBarsVisible,
      surface(),
    );

  const inset = () =>
    props.position === 'header' ? props.tips.headerInset : props.tips.footerInset;

  const fontSize = () =>
    props.position === 'header' ? props.tips.headerFontSize : props.tips.footerFontSize;

  const presentation = () =>
    resolveTextViewerPageTipPresentation(
      props.tips,
      props.themeId,
      props.position,
      { themeSurfaceAppearance: textViewerStore.state.config.themeSurfaceAppearance },
    );

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
          'reader-page-tip pointer-events-none w-full shrink-0 select-none border-solid',
          props.position === 'header' ? 'reader-page-tip-header' : 'reader-page-tip-footer',
          presentation().dividerClass,
          props.class,
        )}
        style={{
          ...readerPageTipBarEdgePaddingStyle(props.position, inset(), {
            omitSafeArea: surface() === 'chrome',
          }),
          color: presentation().textColor,
          'font-size': `${fontSize()}px`,
          'line-height': '1.35',
          ...(presentation().surfaceBackgroundStyle ?? {}),
          ...(presentation().surfaceBackgroundStyle
            ? {}
            : presentation().backgroundColor
              ? { 'background-color': presentation().backgroundColor }
              : {}),
          ...(presentation().dividerColor
            ? { 'border-color': presentation().dividerColor }
            : {}),
        }}
        aria-hidden="true"
      >
        <div class="grid min-w-0 grid-cols-3 items-center gap-1 tabular-nums">
          <span class="min-w-0 truncate text-left">{cellText('Left')}</span>
          <span class="min-w-0 truncate text-center">{cellText('Middle')}</span>
          <span class="min-w-0 truncate text-right">{cellText('Right')}</span>
        </div>
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

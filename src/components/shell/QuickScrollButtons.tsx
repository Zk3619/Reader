/**
 * 快速滚动按钮：滚动到顶部 / 滚动到底部
 * 用于书架等长列表区域（替代 Legado 自定义快速滚动条）
 */

import { createSignal, createEffect, onCleanup, type Accessor } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/shared/icons';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { settingsStore } from '@/stores/settings';
import { scrollToTop as scrollElementToTop } from '@/lib/ui/scroll-to-top';
import { cn } from '@/lib/utils';

const DEFAULT_EDGE_THRESHOLD = 120;

export interface QuickScrollButtonsProps {
  /** 实际发生滚动的容器 */
  container: Accessor<HTMLElement | undefined>;
  /** 距顶/距底超过该像素才显示「到顶」或「到底」按钮 */
  edgeThreshold?: number;
  /** 列表内容变化时重新检测（书籍加载完成、分组切换等） */
  contentRevision?: Accessor<unknown>;
  class?: string;
}

function getScrollMetrics(el: HTMLElement) {
  const { scrollTop, scrollHeight, clientHeight } = el;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  const canScroll = scrollHeight - clientHeight > 1;
  return { scrollTop, distanceFromBottom, canScroll };
}

function QuickScrollButton(props: {
  visible: boolean;
  label: string;
  onClick: () => void;
  reduceMotion: boolean;
  children: import('solid-js').JSX.Element;
}) {
  return (
    <div
      class={cn(
        'origin-center transition-[opacity,transform,max-height,margin] duration-300 ease-out',
        props.reduceMotion ? 'duration-0' : 'duration-300',
        props.visible
          ? 'pointer-events-auto max-h-12 opacity-100 scale-100 translate-y-0'
          : 'pointer-events-none max-h-0 opacity-0 scale-95 translate-y-2 overflow-hidden',
      )}
    >
      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          onClick={props.onClick}
          size="icon"
          tabIndex={props.visible ? 0 : -1}
          class={cn(
            'h-10 w-10 rounded-full shadow-lg',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'transition-transform duration-200 ease-out',
            props.reduceMotion ? '' : 'hover:scale-110 active:scale-95',
          )}
        >
          {props.children}
          <span class="sr-only">{props.label}</span>
        </AppTooltipTrigger>
        <AppTooltipContent>{props.label}</AppTooltipContent>
      </AppTooltip>
    </div>
  );
}

export function QuickScrollButtons(props: QuickScrollButtonsProps) {
  const shell = useShellLayout();
  const edgeThreshold = () => props.edgeThreshold ?? DEFAULT_EDGE_THRESHOLD;
  const reduceMotion = () => settingsStore.state.app.reduceMotion;

  const [showToTop, setShowToTop] = createSignal(false);
  const [showToBottom, setShowToBottom] = createSignal(false);

  function updateVisibility() {
    const el = props.container();
    if (!el) {
      setShowToTop(false);
      setShowToBottom(false);
      return;
    }

    const { scrollTop, distanceFromBottom, canScroll } = getScrollMetrics(el);
    const edge = edgeThreshold();

    if (!canScroll) {
      setShowToTop(false);
      setShowToBottom(false);
      return;
    }

    setShowToTop(scrollTop > edge);
    setShowToBottom(distanceFromBottom > edge);
  }

  function scheduleVisibilityCheck() {
    updateVisibility();
    requestAnimationFrame(() => {
      updateVisibility();
      requestAnimationFrame(updateVisibility);
    });
  }

  function scrollToTop() {
    const el = props.container();
    if (!el) return;
    scrollElementToTop(el, { reduceMotion: reduceMotion() });
  }

  function scrollToBottom() {
    const el = props.container();
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reduceMotion() ? 'auto' : 'smooth',
    });
  }

  createEffect(() => {
    const el = props.container();
    if (!el) return;

    const onScroll = () => updateVisibility();
    el.addEventListener('scroll', onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(scheduleVisibilityCheck);
    resizeObserver.observe(el);
    for (const child of el.children) {
      resizeObserver.observe(child);
    }

    const mutationObserver = new MutationObserver(() => {
      for (const child of el.children) {
        resizeObserver.observe(child);
      }
      scheduleVisibilityCheck();
    });
    mutationObserver.observe(el, { childList: true, subtree: true });

    const onWindowResize = () => scheduleVisibilityCheck();
    window.addEventListener('resize', onWindowResize, { passive: true });

    onCleanup(() => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onWindowResize);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    });
  });

  createEffect(() => {
    props.contentRevision?.();
    props.container();
    scheduleVisibilityCheck();
  });

  return (
    <div
      class={cn(
        'pointer-events-none fixed z-100 flex flex-col items-end gap-2',
        shell().showBottomBar ? 'bottom-20' : 'bottom-8',
        shell().useMobileShell ? 'right-4' : 'right-8',
        props.class,
      )}
      aria-live="polite"
    >
      <QuickScrollButton
        visible={showToTop()}
        label="滚动到顶部"
        onClick={scrollToTop}
        reduceMotion={reduceMotion()}
      >
        <ChevronUpIcon class="h-5 w-5" size={20} />
      </QuickScrollButton>
      <QuickScrollButton
        visible={showToBottom()}
        label="滚动到底部"
        onClick={scrollToBottom}
        reduceMotion={reduceMotion()}
      >
        <ChevronDownIcon class="h-5 w-5" size={20} />
      </QuickScrollButton>
    </div>
  );
}

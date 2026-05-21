/**
 * 回到顶部按钮组件
 * 用于主要内容区域的滚动回到顶部功能
 */

import { createSignal, onMount, onCleanup } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ChevronUpIcon } from '@/components/shared/icons';

interface ScrollToTopProps {
  /** 滚动容器元素（默认为 window），可以是元素、函数或 undefined */
  container?: HTMLElement | Window | (() => HTMLElement | Window);
  /** 显示按钮的滚动阈值（像素） */
  threshold?: number;
  /** 按钮位置类名 */
  positionClass?: string;
}

export function ScrollToTop(props: ScrollToTopProps) {
  const [isVisible, setIsVisible] = createSignal(false);
  const threshold = () => props.threshold ?? 300;
  
  // 获取容器元素
  const getContainer = (): HTMLElement | Window => {
    if (!props.container) {
      return window;
    }
    if (typeof props.container === 'function') {
      return props.container();
    }
    return props.container;
  };

  // 滚动到顶部
  function scrollToTop() {
    const containerEl = getContainer();
    if (containerEl === window) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (containerEl instanceof HTMLElement) {
      containerEl.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // 检查滚动位置
  function checkScrollPosition() {
    try {
      const containerEl = getContainer();
      let scrollTop = 0;

      if (containerEl === window) {
        scrollTop = window.scrollY || document.documentElement.scrollTop;
      } else if (containerEl instanceof HTMLElement) {
        scrollTop = containerEl.scrollTop;
      }

      const shouldShow = scrollTop > threshold();
      setIsVisible(shouldShow);
      
      // 调试日志（开发环境）
      // if (import.meta.env.DEV && scrollTop > 0) {
      //   console.log('[回到顶部] 滚动位置:', scrollTop, '显示按钮:', shouldShow);
      // }
    } catch (error) {
      // 如果容器元素不存在，默认隐藏按钮
      console.warn('[回到顶部] 检查滚动位置失败:', error);
      setIsVisible(false);
    }
  }

  onMount(() => {
    let containerEl: HTMLElement | Window | null = null;
    let initTimer: ReturnType<typeof setTimeout> | null = null;

    // 延迟初始化，确保 DOM 已渲染
    initTimer = setTimeout(() => {
      try {
        containerEl = getContainer();
        
        // 初始检查
        checkScrollPosition();
        
        // 监听滚动事件
        containerEl.addEventListener('scroll', checkScrollPosition, { passive: true });
        
        // 也监听窗口大小变化（可能影响滚动位置）
        window.addEventListener('resize', checkScrollPosition, { passive: true });
      } catch (error) {
        console.warn('[回到顶部] 初始化失败:', error);
      }
    }, 100);

    // 清理函数必须在 onMount 的回调中直接定义，不能在异步回调中
    onCleanup(() => {
      if (initTimer) {
        clearTimeout(initTimer);
      }
      if (containerEl) {
        containerEl.removeEventListener('scroll', checkScrollPosition);
      }
      window.removeEventListener('resize', checkScrollPosition);
    });
  });

  return (
    <div
      class={cn(
        'fixed z-100',
        props.positionClass || 'bottom-8 right-8',
        'transition-all duration-300 ease-out',
        isVisible()
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-4 pointer-events-none'
      )}
    >
      <Tooltip>
        <TooltipTrigger as={Button} onClick={scrollToTop} size="icon" class={cn(
          'rounded-full shadow-lg transition-all duration-200',
          'hover:scale-110 active:scale-95',
          'bg-primary text-primary-foreground',
          'hover:bg-primary/90',
          'h-10 w-10'
        )}>
          <ChevronUpIcon class="h-5 w-5" size={20} />
          <span class="sr-only">回到顶部</span>
        </TooltipTrigger>
        <TooltipContent>回到顶部</TooltipContent>
      </Tooltip>
    </div>
  );
}

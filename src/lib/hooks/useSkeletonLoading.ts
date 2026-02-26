/**
 * Skeleton 加载状态管理 Hook
 * 解决快速加载导致的 skeleton 闪烁问题
 * 
 * 功能：
 * 1. 延迟显示 skeleton（避免快速闪现）
 * 2. 最小显示时间（确保用户能看到加载状态）
 */

import { createSignal, createEffect, onCleanup, type Accessor } from 'solid-js';

export interface UseSkeletonLoadingOptions {
  /** 延迟显示时间（ms），默认 100ms - 如果加载在 100ms 内完成，不显示 skeleton */
  delay?: number;
  /** 最小显示时间（ms），默认 300ms - skeleton 至少显示这么长时间 */
  minDisplayTime?: number;
}

/**
 * 使用 Skeleton 加载状态管理
 * @param loading 原始加载状态
 * @param options 配置选项
 * @returns 处理后的加载状态（用于显示 skeleton）
 */
export function useSkeletonLoading(
  loading: Accessor<boolean>,
  options: UseSkeletonLoadingOptions = {}
): Accessor<boolean> {
  const { delay = 100, minDisplayTime = 300 } = options;
  
  const [showSkeleton, setShowSkeleton] = createSignal(false);
  const [skeletonStartTime, setSkeletonStartTime] = createSignal<number | null>(null);
  
  let delayTimer: number | undefined;
  let minDisplayTimer: number | undefined;

  createEffect(() => {
    const isLoading = loading();
    
    if (isLoading) {
      // 开始加载：延迟显示 skeleton
      delayTimer = window.setTimeout(() => {
        // 如果仍在加载，显示 skeleton
        if (loading()) {
          setShowSkeleton(true);
          setSkeletonStartTime(Date.now());
        }
      }, delay);
    } else {
      // 加载完成：清理延迟定时器
      if (delayTimer !== undefined) {
        clearTimeout(delayTimer);
        delayTimer = undefined;
      }
      
      // 如果 skeleton 正在显示，确保最小显示时间
      if (showSkeleton() && skeletonStartTime() !== null) {
        const elapsed = Date.now() - skeletonStartTime()!;
        const remaining = minDisplayTime - elapsed;
        
        if (remaining > 0) {
          // 还需要等待剩余时间
          minDisplayTimer = window.setTimeout(() => {
            setShowSkeleton(false);
            setSkeletonStartTime(null);
          }, remaining);
        } else {
          // 已经超过最小显示时间，立即隐藏
          setShowSkeleton(false);
          setSkeletonStartTime(null);
        }
      }
    }
  });

  onCleanup(() => {
    if (delayTimer !== undefined) {
      clearTimeout(delayTimer);
    }
    if (minDisplayTimer !== undefined) {
      clearTimeout(minDisplayTimer);
    }
  });

  return showSkeleton;
}

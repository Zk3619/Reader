/**
 * 响应式：某书已缓存章节索引
 */

import { createSignal, createEffect, on, onMount, onCleanup } from 'solid-js';
import { getCachedChapterIndices } from '@/lib/chapter-cache/cached-indices';

export function useCachedChapterIndices(
  bookUrl: () => string | undefined,
  enabled: () => boolean = () => true,
  /** 为 true 时在空闲时再查库，避免挡住目录首屏 */
  defer = false,
) {
  const [cached, setCached] = createSignal<ReadonlySet<number>>(new Set());
  const [loading, setLoading] = createSignal(false);

  const refresh = async () => {
    const url = bookUrl();
    if (!url || !enabled()) {
      setCached(new Set<number>());
      return;
    }
    setLoading(true);
    try {
      setCached(await getCachedChapterIndices(url));
    } finally {
      setLoading(false);
    }
  };

  createEffect(
    on(
      () => [bookUrl(), enabled()] as const,
      () => {
        if (!enabled()) {
          setCached(new Set<number>());
          return;
        }
        if (!defer) {
          void refresh();
          return;
        }
        let cancelled = false;
        const run = () => {
          if (!cancelled) void refresh();
        };
        let idleId: number | undefined;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        if (typeof requestIdleCallback === 'function') {
          idleId = requestIdleCallback(run, { timeout: 400 });
        } else {
          timeoutId = setTimeout(run, 0);
        }
        onCleanup(() => {
          cancelled = true;
          if (idleId != null && typeof cancelIdleCallback === 'function') {
            cancelIdleCallback(idleId);
          }
          if (timeoutId != null) clearTimeout(timeoutId);
        });
      },
    ),
  );

  onMount(() => {
    const onCacheUpdated = (e: Event) => {
      const url = (e as CustomEvent<{ bookUrl?: string }>).detail?.bookUrl;
      if (url && url === bookUrl()) {
        void refresh();
      }
    };
    window.addEventListener('chapter-cache-updated', onCacheUpdated);
    onCleanup(() =>
      window.removeEventListener('chapter-cache-updated', onCacheUpdated),
    );
  });

  return { cached, loading, refresh };
}

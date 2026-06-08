import { createSignal, onCleanup, onMount } from 'solid-js';

const panelCache = new Map<string, unknown>();

export function invalidateSettingsPanelCache(cacheKey?: string): void {
  if (cacheKey) {
    panelCache.delete(cacheKey);
    return;
  }
  panelCache.clear();
}

export function patchSettingsPanelCache<T extends object>(
  cacheKey: string,
  patch: Partial<T>,
): void {
  const cached = panelCache.get(cacheKey) as T | undefined;
  if (cached) {
    panelCache.set(cacheKey, { ...cached, ...patch });
  }
}

export interface UseSettingsPanelLoadOptions {
  /** 每次进入面板都重新拉取（仍可先展示模块级缓存） */
  refreshOnMount?: boolean;
}

/**
 * 设置子面板数据加载：模块级缓存避免 Tab/子页切换重复请求；
 * generation 计数避免卸载后异步结果回写阻塞或污染 UI。
 */
export function useSettingsPanelLoad<T>(
  cacheKey: string,
  load: () => Promise<T>,
  options?: UseSettingsPanelLoadOptions,
) {
  const cached = panelCache.get(cacheKey) as T | undefined;
  const [data, setData] = createSignal<T | null>(cached ?? null);
  const [loading, setLoading] = createSignal(cached == null);
  const [error, setError] = createSignal<string | null>(null);

  let generation = 0;

  const refresh = async (opts?: { silent?: boolean }) => {
    const gen = ++generation;
    const showLoading = !opts?.silent || data() == null;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const result = await load();
      if (gen !== generation) return;
      panelCache.set(cacheKey, result);
      setData(() => result);
    } catch (e) {
      if (gen !== generation) return;
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      console.error(`[settings-panel:${cacheKey}]`, e);
      throw e;
    } finally {
      if (gen === generation) setLoading(false);
    }
  };

  onMount(() => {
    if (options?.refreshOnMount || data() == null) {
      void refresh({ silent: data() != null }).catch(() => {});
    }
    onCleanup(() => {
      generation++;
    });
  });

  return { data, loading, error, refresh };
}

import { createSignal, onCleanup, onMount } from 'solid-js';

const panelCache = new Map<string, unknown>();

/**
 * 设置子面板数据加载：模块级缓存避免 Tab/子页切换重复请求；
 * generation 计数避免卸载后异步结果回写阻塞或污染 UI。
 */
export function useSettingsPanelLoad<T>(cacheKey: string, load: () => Promise<T>) {
  const cached = panelCache.get(cacheKey) as T | undefined;
  const [data, setData] = createSignal<T | null>(cached ?? null);
  const [loading, setLoading] = createSignal(cached == null);

  let generation = 0;

  const refresh = async (opts?: { silent?: boolean }) => {
    const gen = ++generation;
    if (!opts?.silent && data() == null) setLoading(true);
    try {
      const result = await load();
      if (gen !== generation) return;
      panelCache.set(cacheKey, result);
      setData(() => result);
    } catch (e) {
      if (gen !== generation) return;
      console.error(`[settings-panel:${cacheKey}]`, e);
      throw e;
    } finally {
      if (gen === generation) setLoading(false);
    }
  };

  onMount(() => {
    if (data() == null) {
      void refresh();
    }
    onCleanup(() => {
      generation++;
    });
  });

  return { data, loading, refresh };
}

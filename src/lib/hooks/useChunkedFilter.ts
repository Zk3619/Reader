import { createEffect, createSignal, type Accessor } from 'solid-js';
import {
  isChunkedFilterAbortError,
  runChunkedListFilter,
  yieldFilterChunk,
  type ChunkedListFilterProgress,
} from '@/lib/list/chunked-list-filter';

export interface UseChunkedFilterOptions<T> {
  items: Accessor<readonly T[]>;
  /** 额外依赖：搜索词、筛选条件等变化时触发重新筛选 */
  deps?: Accessor<unknown>;
  isPassThrough: Accessor<boolean>;
  match: (item: T) => boolean;
  chunkSize?: number;
  progressLabel?: string;
  postProcess?: (matched: T[]) => T[] | Promise<T[]>;
}

export interface UseChunkedFilterResult<T> {
  filtered: Accessor<T[]>;
  filtering: Accessor<boolean>;
  progressText: Accessor<string>;
}

export function useChunkedFilter<T>(options: UseChunkedFilterOptions<T>): UseChunkedFilterResult<T> {
  const [filtered, setFiltered] = createSignal<T[]>([]);
  const [filtering, setFiltering] = createSignal(false);
  const [progressText, setProgressText] = createSignal('');
  let jobId = 0;

  createEffect(() => {
    options.deps?.();
    const items = options.items();
    const passThrough = options.isPassThrough();
    const match = options.match;
    const job = ++jobId;

    if (items.length === 0) {
      setFiltered([]);
      setFiltering(false);
      setProgressText('');
      return;
    }

    const finish = async (matched: T[]) => {
      if (options.postProcess) {
        await yieldFilterChunk();
        if (job !== jobId) return;
        const processed = await options.postProcess(matched);
        if (job !== jobId) return;
        setFiltered(processed);
      } else {
        setFiltered(matched);
      }
      setProgressText('');
      setFiltering(false);
    };

    if (passThrough) {
      setFiltering(Boolean(options.postProcess));
      void finish([...items]).catch((error) => {
        if (isChunkedFilterAbortError(error)) return;
        console.error('列表后处理失败:', error);
        if (job !== jobId) return;
        setFiltered([]);
        setProgressText('');
        setFiltering(false);
      });
      return;
    }

    setFiltering(true);
    void (async () => {
      try {
        const matched = await runChunkedListFilter(items, {
          match,
          chunkSize: options.chunkSize,
          shouldAbort: () => job !== jobId,
          onProgress: (progress: ChunkedListFilterProgress) => {
            if (job !== jobId) return;
            const label = options.progressLabel ?? '正在筛选';
            setProgressText(`${label} ${progress.processed}/${progress.total}（已匹配 ${progress.matched}）`);
          },
          onPartialResult: (partial) => {
            if (job !== jobId) return;
            setFiltered([...partial]);
          },
        });
        if (job !== jobId) return;
        await finish(matched);
      } catch (error) {
        if (isChunkedFilterAbortError(error)) return;
        console.error('分批筛选失败:', error);
        if (job !== jobId) return;
        setFiltered([]);
        setProgressText('');
        setFiltering(false);
      }
    })();
  });

  return { filtered, filtering, progressText };
}

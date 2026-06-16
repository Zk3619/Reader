import { createEffect, createSignal, type Accessor } from 'solid-js';
import { isChunkedFilterAbortError, yieldFilterChunk } from '@/lib/list/chunked-list-filter';

export interface UseChunkedDerivedOptions<T> {
  deps: Accessor<unknown>;
  compute: () => T | Promise<T>;
  progressLabel?: string;
}

export interface UseChunkedDerivedResult<T> {
  value: Accessor<T>;
  computing: Accessor<boolean>;
  progressText: Accessor<string>;
}

export function useChunkedDerived<T>(options: UseChunkedDerivedOptions<T>): UseChunkedDerivedResult<T> {
  const [value, setValue] = createSignal<T>();
  const [computing, setComputing] = createSignal(false);
  const [progressText, setProgressText] = createSignal('');
  let jobId = 0;

  createEffect(() => {
    options.deps();
    const job = ++jobId;
    setComputing(true);
    const label = options.progressLabel ?? '正在处理';

    void (async () => {
      try {
        setProgressText(`${label}…`);
        await yieldFilterChunk();
        if (job !== jobId) return;
        const result = await options.compute();
        if (job !== jobId) return;
        setValue(() => result);
        setProgressText('');
        setComputing(false);
      } catch (error) {
        if (isChunkedFilterAbortError(error)) return;
        console.error('分批计算失败:', error);
        if (job !== jobId) return;
        setProgressText('');
        setComputing(false);
      }
    })();
  });

  return {
    value: () => value() as T,
    computing,
    progressText,
  };
}

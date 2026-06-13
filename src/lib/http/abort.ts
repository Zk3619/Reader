/** 是否为 fetch / AbortController 取消（非超时业务错误） */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return false;
}

/** 合并多个 AbortSignal（任一 abort 即触发） */
export function combineAbortSignals(
  ...signals: (AbortSignal | undefined)[]
): AbortSignal | undefined {
  const defined = signals.filter((s): s is AbortSignal => s != null);
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];

  const merged = new AbortController();
  const onAbort = () => {
    if (!merged.signal.aborted) merged.abort();
  };

  for (const signal of defined) {
    if (signal.aborted) {
      onAbort();
      return merged.signal;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  return merged.signal;
}

/** 合并超时与一个或多个用户 AbortSignal */
export function mergeAbortSignals(
  timeoutMs: number,
  ...userSignals: (AbortSignal | undefined)[]
): { signal: AbortSignal; dispose: () => void } {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  const dispose = () => {
    clearTimeout(timeoutId);
  };

  const signals = userSignals.filter((s): s is AbortSignal => s != null);

  if (signals.length === 0) {
    return { signal: timeoutController.signal, dispose };
  }

  for (const signal of signals) {
    if (signal.aborted) {
      dispose();
      return { signal, dispose: () => {} };
    }
  }

  const merged = new AbortController();
  const onAbort = () => {
    if (!merged.signal.aborted) merged.abort();
    dispose();
  };

  for (const signal of signals) {
    signal.addEventListener('abort', onAbort, { once: true });
  }
  timeoutController.signal.addEventListener('abort', onAbort, { once: true });

  return {
    signal: merged.signal,
    dispose: () => {
      for (const signal of signals) {
        signal.removeEventListener('abort', onAbort);
      }
      timeoutController.signal.removeEventListener('abort', onAbort);
      dispose();
    },
  };
}

/** Tauri 等无法真正中断的请求：在 signal 触发时拒绝等待（底层连接可能仍在进行） */
export function raceWithAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

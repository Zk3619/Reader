/** 是否为 fetch / AbortController 取消（非超时业务错误） */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return false;
}

/** 合并超时与用户 AbortSignal */
export function mergeAbortSignals(
  timeoutMs: number,
  userSignal?: AbortSignal,
): { signal: AbortSignal; dispose: () => void } {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  const dispose = () => {
    clearTimeout(timeoutId);
  };

  if (!userSignal) {
    return { signal: timeoutController.signal, dispose };
  }

  if (userSignal.aborted) {
    dispose();
    return { signal: userSignal, dispose: () => {} };
  }

  const merged = new AbortController();
  const onAbort = () => {
    if (!merged.signal.aborted) merged.abort();
    dispose();
  };

  userSignal.addEventListener('abort', onAbort, { once: true });
  timeoutController.signal.addEventListener('abort', onAbort, { once: true });

  return {
    signal: merged.signal,
    dispose: () => {
      userSignal.removeEventListener('abort', onAbort);
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

export interface ChunkedListFilterProgress {
  processed: number;
  total: number;
  matched: number;
}

export interface RunChunkedListFilterOptions<T> {
  match: (item: T) => boolean;
  chunkSize?: number;
  shouldAbort?: () => boolean;
  onProgress?: (progress: ChunkedListFilterProgress) => void;
  onPartialResult?: (matched: T[]) => void;
}

const DEFAULT_CHUNK_SIZE = 400;

class ChunkedFilterAbortError extends Error {
  constructor() {
    super('Chunked filter aborted');
    this.name = 'ChunkedFilterAbortError';
  }
}

export function assertChunkedFilterNotAborted(shouldAbort?: () => boolean): void {
  if (shouldAbort?.()) {
    throw new ChunkedFilterAbortError();
  }
}

function assertNotAborted(shouldAbort?: () => boolean): void {
  assertChunkedFilterNotAborted(shouldAbort);
}

export function yieldFilterChunk(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 48 });
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}

export async function runChunkedListFilter<T>(
  items: readonly T[],
  options: RunChunkedListFilterOptions<T>,
): Promise<T[]> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const matched: T[] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    assertNotAborted(options.shouldAbort);
    const end = Math.min(i + chunkSize, items.length);
    for (let j = i; j < end; j++) {
      const item = items[j]!;
      if (options.match(item)) {
        matched.push(item);
      }
    }
    options.onProgress?.({
      processed: end,
      total: items.length,
      matched: matched.length,
    });
    options.onPartialResult?.(matched);
    if (end < items.length) {
      await yieldFilterChunk();
    }
  }

  return matched;
}

export function isChunkedFilterAbortError(error: unknown): boolean {
  return error instanceof ChunkedFilterAbortError;
}

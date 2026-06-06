import { For, createMemo } from 'solid-js';

/** 阅读器正文加载骨架（分页/滚动共用） */
export function ReaderContentSkeleton() {
  const paragraphs = createMemo(() =>
    Array.from({ length: 8 }, () => {
      const lineCount = Math.floor(Math.random() * 3) + 2;
      return Array.from({ length: lineCount }, () => Math.floor(Math.random() * 30) + 70);
    }),
  );

  return (
    <>
      <div class="mb-6 flex items-center justify-center">
        <div class="skeleton-bar h-7 w-48 rounded" />
      </div>
      <div class="space-y-5">
        <For each={paragraphs()}>
          {(lines) => (
            <div class="space-y-2.5">
              <For each={lines}>
                {(width) => (
                  <div class="skeleton-bar h-4 rounded" style={{ width: `${width}%` }} />
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </>
  );
}

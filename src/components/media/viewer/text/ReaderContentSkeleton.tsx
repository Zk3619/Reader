import { For } from 'solid-js';

/** 固定段落行宽（%），避免 Math.random 导致重挂载时骨架条错位 */
const SKELETON_PARAGRAPHS: readonly (readonly number[])[] = [
  [92, 88, 74],
  [95, 82],
  [90, 85, 78, 70],
  [88, 93, 76],
  [91, 84, 72],
  [94, 80, 77],
  [89, 86, 75, 68],
  [93, 81],
];

/** 阅读器正文加载骨架（分页/滚动共用） */
export function ReaderContentSkeleton() {
  return (
    <>
      <div class="mb-6 flex items-center justify-center">
        <div class="skeleton-bar h-7 w-48 rounded" />
      </div>
      <div class="space-y-5">
        <For each={SKELETON_PARAGRAPHS}>
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

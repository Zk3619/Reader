import { ChapterBodyPrefetchControls } from '@/components/viewer/ChapterBodyPrefetchControls';

/** 全局设置：章节正文向前/向后预下载 */
export function ChapterBodyPrefetchSetting() {
  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <ChapterBodyPrefetchControls viewer="text" />
    </div>
  );
}

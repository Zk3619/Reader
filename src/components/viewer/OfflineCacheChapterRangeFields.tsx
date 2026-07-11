/**
 * 离线缓存弹窗：章节范围输入（text / image viewer 共用）
 */

import { AppTextField, AppTextFieldInput, AppTextFieldLabel } from '@/components/shared/AppTextField';

export interface OfflineCacheChapterRangeFieldsProps {
  total: number;
  startChapter: string;
  endChapter: string;
  onStartChapterChange: (value: string) => void;
  onEndChapterChange: (value: string) => void;
  hint?: string;
}

export function OfflineCacheChapterRangeFields(
  props: OfflineCacheChapterRangeFieldsProps,
) {
  return (
    <div class="space-y-4 px-6 py-2">
      <div class="grid grid-cols-2 gap-3">
        <AppTextField class="space-y-1.5">
          <AppTextFieldLabel>起始章节</AppTextFieldLabel>
          <AppTextFieldInput
            type="number"
            min={1}
            max={props.total}
            value={props.startChapter}
            onInput={(e) => props.onStartChapterChange(e.currentTarget.value)}
          />
        </AppTextField>
        <AppTextField class="space-y-1.5">
          <AppTextFieldLabel>结束章节</AppTextFieldLabel>
          <AppTextFieldInput
            type="number"
            min={1}
            max={props.total}
            value={props.endChapter}
            onInput={(e) => props.onEndChapterChange(e.currentTarget.value)}
          />
        </AppTextField>
      </div>
      <p class="text-xs text-muted-foreground">{props.hint}</p>
    </div>
  );
}

/**
 * 阅读书源页顶栏 Tab：书源 / 图源 / 听书源 / 视频源 / 文件源（不含 lx 音乐源）
 */

import { AppTabs } from '@/components/shared/AppTabs';
import {
  sourceTypeTabValue,
  setSourceTypeTab,
  type SourceTypeTab,
} from '@/stores/shell-tabs';
import { BookSourceType } from '@/lib/book-source/book-type';

const SOURCE_TABS: SourceTypeTab[] = ['text', 'image', 'audio', 'video', 'file'];

const SOURCE_TAB_LABELS: Record<SourceTypeTab, string> = {
  text: '书源',
  image: '图源',
  audio: '听书源',
  video: '视频源',
  file: '文件源',
};

export interface SourcesTypeTabsProps {
  class?: string;
}

export function SourcesTypeTabs(props: SourcesTypeTabsProps) {
  const tab = () => sourceTypeTabValue();

  return (
    <div class={props.class}>
      <AppTabs
        value={tab()}
        onChange={(v) => setSourceTypeTab(v as SourceTypeTab)}
        ariaLabel="来源类型"
        variant="settings-equal"
        options={SOURCE_TABS}
        labels={SOURCE_TAB_LABELS}
      />
    </div>
  );
}

/** 当前应过滤的 bookSourceType */
export function effectiveSourceTypeFilter(): number | null {
  const tab = sourceTypeTabValue();
  switch (tab) {
    case 'image':
      return BookSourceType.image;
    case 'audio':
      return BookSourceType.audio;
    case 'video':
      return BookSourceType.video;
    case 'file':
      return BookSourceType.file;
    default:
      return BookSourceType.text;
  }
}

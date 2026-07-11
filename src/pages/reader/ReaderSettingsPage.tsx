/**
 * 阅读模块设置（规则、书源 Web 服务、Viewer、缓存等）
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { ViewerChromeLayoutSetting } from '@/components/settings/ViewerChromeLayoutSetting';
import { BookInfoPresentationSetting } from '@/components/settings/BookInfoPresentationSetting';
import { SourceExploreDrawerLayoutSetting } from '@/components/settings/SourceExploreDrawerLayoutSetting';
import { SourceBlocklistSetting } from '@/components/settings/SourceBlocklistSetting';
import { BooksStorageSetting } from '@/components/settings/BooksStorageSetting';
import { CoverCacheSetting } from '@/components/settings/CoverCacheSetting';
import { ChapterCacheSetting } from '@/components/settings/ChapterCacheSetting';
import { ReadingRulesHub } from '@/components/settings/ReadingRulesHub';
import { ChapterBodyPrefetchSetting } from '@/components/settings/ChapterBodyPrefetchSetting';
import { BrightnessSyncSystemSetting } from '@/components/settings/BrightnessSyncSystemSetting';
import { WebServiceSettingBlock } from '@/components/settings/WebServiceSetting';
import { InnerWebRenderModeSetting } from '@/components/settings/InnerWebRenderModeSetting';
import { TocPaginationSafetySetting } from '@/components/settings/TocPaginationSafetySetting';
import { type ReadingRulePageId } from '@/lib/settings/reading-rules-nav';
import { cn } from '@/lib/utils';
import {
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';

export interface ReaderSettingsPageProps {
  onOpenReadingRulePage?: (page: ReadingRulePageId) => void;
}

export function ReaderSettingsPage(props: ReaderSettingsPageProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot)}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="阅读设置"
        description="阅读规则、书源 Web 服务、Viewer 与缓存"
        titleSlot={
          <PageToolbarTitleDropdown
            title="阅读设置"
            description="阅读规则、书源 Web 服务、Viewer 与缓存"
            dropdownEnabled={false}
          />
        }
      />
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col')}>
        <div class="flex min-h-0 w-full flex-1 flex-col gap-4 pb-4">
          <ReadingRulesHub onOpen={(page) => props.onOpenReadingRulePage?.(page)} />
          <ChapterBodyPrefetchSetting />
          <BrightnessSyncSystemSetting />
          <TocPaginationSafetySetting />
          <InnerWebRenderModeSetting />
          <ViewerChromeLayoutSetting />
          <BookInfoPresentationSetting />
          <SourceExploreDrawerLayoutSetting />
          <WebServiceSettingBlock />
          <SourceBlocklistSetting />
          <BooksStorageSetting />
          <CoverCacheSetting />
          <ChapterCacheSetting />
        </div>
      </div>
    </section>
  );
}

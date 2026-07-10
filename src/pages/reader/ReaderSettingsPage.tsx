/**
 * 阅读模块设置（规则、书源 Web 服务、Viewer、缓存等）
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
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
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';

export interface ReaderSettingsPageProps {
  onOpenReadingRulePage?: (page: ReadingRulePageId) => void;
}

export function ReaderSettingsPage(props: ReaderSettingsPageProps) {
  return (
    <div class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <PageToolbar
        title="阅读设置"
        description="阅读规则、书源 Web 服务、Viewer 与缓存"
      />
      <div class={cn(mainShellPageScroll, 'space-y-4 px-4 pb-8')}>
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
  );
}

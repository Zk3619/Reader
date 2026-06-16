import { For, Show } from 'solid-js';
import { ThemeSwitch } from '@/components/shell/ThemeSwitch';
import { Switch as UiSwitch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import { ShellLayoutSetting } from '@/components/shell/ShellLayoutSetting';
import { ViewerChromeLayoutSetting } from '@/components/settings/ViewerChromeLayoutSetting';
import { InnerWebRenderModeSetting } from '@/components/settings/InnerWebRenderModeSetting';
import { BookInfoPresentationSetting } from '@/components/settings/BookInfoPresentationSetting';
import { TocPaginationSafetySetting } from '@/components/settings/TocPaginationSafetySetting';
import { SourceExploreDrawerLayoutSetting } from '@/components/settings/SourceExploreDrawerLayoutSetting';
import { SourceBlocklistSetting } from '@/components/settings/SourceBlocklistSetting';
import { StorageAndWebViewSetting } from '@/components/settings/StorageAndWebViewSetting';
import { BooksStorageSetting } from '@/components/settings/BooksStorageSetting';
import { CoverCacheSetting } from '@/components/settings/CoverCacheSetting';
import { ChapterCacheSetting } from '@/components/settings/ChapterCacheSetting';
import { ReadingRulesHub } from '@/components/settings/ReadingRulesHub';
import { ChapterBodyPrefetchSetting } from '@/components/settings/ChapterBodyPrefetchSetting';
import { WebServiceSettingBlock } from '@/components/settings/WebServiceSetting';
import { DataBackupSetting } from '@/components/settings/DataBackupSetting';
import { settingsStore } from '@/stores/settings';
import type { SettingsCategoryId } from '@/lib/settings/settings-catalog';
import { type ReadingRulePageId } from '@/lib/settings/reading-rules-nav';
import { SettingItemAnchor } from '@/pages/settings/SettingItemAnchor';

export interface SettingsCategoryContentProps {
  categoryId: SettingsCategoryId;
  highlightedItemId?: string | null;
  onOpenReadingRulePage?: (page: ReadingRulePageId) => void;
}

export function SettingsCategoryContent(props: SettingsCategoryContentProps) {
  const highlight = (id: string) => props.highlightedItemId === id;

  return (
    <div class="w-full space-y-4">
      <Show when={props.categoryId === 'appearance'}>
        <SettingItemAnchor id="theme" highlighted={highlight('theme')}>
          <div class="rounded-2xl border border-border/50 bg-card p-6">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-semibold text-foreground">主题</h3>
                <p class="text-sm text-muted-foreground">
                  浅色、跟随系统或深色；左键循环切换，右键或长按选择
                </p>
              </div>
              <ThemeSwitch withTooltip={false} />
            </div>
          </div>
        </SettingItemAnchor>

        <SettingItemAnchor id="reduce-motion" highlighted={highlight('reduce-motion')}>
          <div class="rounded-2xl border border-border/50 bg-card p-6">
            <div class="flex items-center justify-between gap-4">
              <div class="space-y-0.5">
                <h3 class="font-semibold text-foreground">减少动效</h3>
                <p class="text-sm text-muted-foreground">
                  关闭或缩短动画与过渡，适合对动效敏感或追求性能的用户
                </p>
              </div>
              <UiSwitch
                checked={settingsStore.state.app.reduceMotion}
                onChange={(v: boolean) => settingsStore.setReduceMotion(!!v)}
              >
                <SwitchControl class="data-disabled:cursor-not-allowed">
                  <SwitchThumb />
                </SwitchControl>
                <SwitchLabel class="sr-only">减少动效</SwitchLabel>
              </UiSwitch>
            </div>
          </div>
        </SettingItemAnchor>

        <SettingItemAnchor id="shell-layout" highlighted={highlight('shell-layout')}>
          <ShellLayoutSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="viewer-chrome" highlighted={highlight('viewer-chrome')}>
          <ViewerChromeLayoutSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="book-info-presentation" highlighted={highlight('book-info-presentation')}>
          <BookInfoPresentationSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="source-explore-drawer" highlighted={highlight('source-explore-drawer')}>
          <SourceExploreDrawerLayoutSetting />
        </SettingItemAnchor>
      </Show>

      <Show when={props.categoryId === 'reading'}>
        <SettingItemAnchor id="reading-rules-hub" highlighted={highlight('reading-rules-hub')}>
          <ReadingRulesHub onOpen={(page) => props.onOpenReadingRulePage?.(page)} />
        </SettingItemAnchor>

        <SettingItemAnchor id="chapter-body-prefetch" highlighted={highlight('chapter-body-prefetch')}>
          <ChapterBodyPrefetchSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="toc-pagination-safety" highlighted={highlight('toc-pagination-safety')}>
          <TocPaginationSafetySetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="inner-web-render" highlighted={highlight('inner-web-render')}>
          <InnerWebRenderModeSetting />
        </SettingItemAnchor>
      </Show>

      <Show when={props.categoryId === 'sources'}>
        <SettingItemAnchor id="web-service" highlighted={highlight('web-service')}>
          <WebServiceSettingBlock />
        </SettingItemAnchor>

        <SettingItemAnchor id="source-blocklist" highlighted={highlight('source-blocklist')}>
          <SourceBlocklistSetting />
        </SettingItemAnchor>
      </Show>

      <Show when={props.categoryId === 'storage'}>
        <SettingItemAnchor id="storage-webview" highlighted={highlight('storage-webview')}>
          <StorageAndWebViewSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="books-storage" highlighted={highlight('books-storage')}>
          <BooksStorageSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="cover-cache" highlighted={highlight('cover-cache')}>
          <CoverCacheSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="chapter-cache" highlighted={highlight('chapter-cache')}>
          <ChapterCacheSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="database-backup" highlighted={highlight('database-backup')}>
          <div class="rounded-2xl border border-border/50 bg-card p-6">
            <div class="mb-4">
              <h3 class="mb-2 font-semibold text-foreground">数据备份与恢复</h3>
              <p class="text-sm text-muted-foreground">
                导出 ZIP 本地备份，或从 ZIP / 数据库文件恢复（参考 Legado 备份格式）
              </p>
            </div>
            <DataBackupSetting />
          </div>
        </SettingItemAnchor>
      </Show>

      <Show when={props.categoryId === 'other'}>
        <SettingItemAnchor id="tech-stack" highlighted={highlight('tech-stack')}>
          <div class="rounded-2xl border border-dashed border-border bg-muted/30 p-6">
            <h3 class="mb-3 font-semibold text-foreground">技术栈</h3>
            <div class="flex flex-wrap gap-2">
              <For each={['Tauri 2.0', 'SolidJS', 'TailwindCSS v4', 'solid-ui', 'Kobalte']}>
                {(tech) => (
                  <span class="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
                    {tech}
                  </span>
                )}
              </For>
            </div>
          </div>
        </SettingItemAnchor>
      </Show>
    </div>
  );
}

import { createSignal, For, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
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
import { ReplaceRulesPage } from '@/pages/replace-rules/ReplaceRulesPage';
import { DatabaseBackup } from '@/components/shared/DatabaseBackup';
import { settingsStore } from '@/stores/settings';
import type { SettingsCategoryId } from '@/lib/settings/settings-catalog';
import { SettingItemAnchor } from '@/pages/settings/SettingItemAnchor';

export interface SettingsCategoryContentProps {
  categoryId: SettingsCategoryId;
  highlightedItemId?: string | null;
}

export function SettingsCategoryContent(props: SettingsCategoryContentProps) {
  const [greetMsg, setGreetMsg] = createSignal('');

  async function testTauriCommand() {
    try {
      const msg = await invoke<string>('greet', { name: 'Reader' });
      setGreetMsg(msg);
    } catch (e) {
      setGreetMsg(e instanceof Error ? e.message : '调用失败');
    }
  }

  const highlight = (id: string) => props.highlightedItemId === id;

  return (
    <div class="mx-auto w-full max-w-4xl space-y-4 px-1">
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
      </Show>

      <Show when={props.categoryId === 'reading'}>
        <SettingItemAnchor id="book-info-presentation" highlighted={highlight('book-info-presentation')}>
          <BookInfoPresentationSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="toc-pagination-safety" highlighted={highlight('toc-pagination-safety')}>
          <TocPaginationSafetySetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="inner-web-render" highlighted={highlight('inner-web-render')}>
          <InnerWebRenderModeSetting />
        </SettingItemAnchor>
      </Show>

      <Show when={props.categoryId === 'sources'}>
        <SettingItemAnchor id="source-explore-drawer" highlighted={highlight('source-explore-drawer')}>
          <SourceExploreDrawerLayoutSetting />
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
      </Show>

      <Show when={props.categoryId === 'data'}>
        <SettingItemAnchor id="replace-rules" highlighted={highlight('replace-rules')}>
          <div class="rounded-2xl border border-border/50 bg-card p-6">
            <div class="mb-4">
              <h3 class="mb-2 font-semibold text-foreground">替换规则</h3>
              <p class="text-sm text-muted-foreground">
                管理正文替换规则，阅读器内可开关「应用替换」
              </p>
            </div>
            <ReplaceRulesPage />
          </div>
        </SettingItemAnchor>

        <SettingItemAnchor id="database-backup" highlighted={highlight('database-backup')}>
          <div class="rounded-2xl border border-border/50 bg-card p-6">
            <div class="mb-4">
              <h3 class="mb-2 font-semibold text-foreground">数据备份</h3>
              <p class="text-sm text-muted-foreground">
                导出数据库备份文件，或从备份文件恢复数据
              </p>
            </div>
            <DatabaseBackup />
          </div>
        </SettingItemAnchor>
      </Show>

      <Show when={props.categoryId === 'other'}>
        <SettingItemAnchor id="tauri-test" highlighted={highlight('tauri-test')}>
          <div class="rounded-2xl border border-border/50 bg-card p-6">
            <h3 class="mb-4 font-semibold text-foreground">Tauri 命令测试</h3>
            <div class="flex flex-col gap-4">
              <Button onClick={testTauriCommand} variant="default">
                测试 Tauri invoke
              </Button>
              <Show when={greetMsg()}>
                <div class="rounded-xl bg-success/10 p-4 text-sm text-success-foreground">
                  <span class="font-medium">响应结果：</span> {greetMsg()}
                </div>
              </Show>
            </div>
          </div>
        </SettingItemAnchor>

        <SettingItemAnchor id="button-variants" highlighted={highlight('button-variants')}>
          <div class="rounded-2xl border border-border/50 bg-card p-6">
            <h3 class="mb-4 font-semibold text-foreground">Button 组件变体</h3>
            <div class="flex flex-wrap gap-3">
              <Button variant="default">Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
            </div>
          </div>
        </SettingItemAnchor>

        <SettingItemAnchor id="button-sizes" highlighted={highlight('button-sizes')}>
          <div class="rounded-2xl border border-border/50 bg-card p-6">
            <h3 class="mb-4 font-semibold text-foreground">Button 尺寸</h3>
            <div class="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon">🔔</Button>
            </div>
          </div>
        </SettingItemAnchor>

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

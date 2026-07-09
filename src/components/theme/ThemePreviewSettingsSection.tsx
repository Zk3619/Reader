/**
 * Theme Studio — 设置页预览（对齐 SettingsPage 桌面 Tab + 移动 Hub 卡片）
 */

import { For, Show } from 'solid-js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SettingsThemedHubCard } from '@/components/theme/SettingsThemedHubCard';
import { ThemedPreviewRegion } from '@/components/theme/ThemedPreviewRegion';
import { ThemedPreviewSurface } from '@/components/theme/ThemedPreviewSurface';
import { SettingsCategoryIcon } from '@/pages/settings/SettingsCategoryIcon';
import { PageToolbarTitleText } from '@/components/shell/PageToolbar';
import { SETTINGS_CATEGORIES } from '@/lib/settings/settings-catalog';
import { bookshelfCompactListCardClass } from '@/lib/bookshelf/book-group-card-styles';
import type { AppComponentId, ThemeComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { themePreviewHighlight } from '@/lib/theme/preview/preview-highlight';
import { shouldShowAppPreviewComponent } from '@/lib/theme/preview/preview-visibility';
import {
  themePreviewSurfaceShellClass,
  themePreviewTextClasses,
} from '@/lib/theme/preview/theme-component-text-roles';
import { mainShellPageScroll } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import { ChevronRightIcon } from '@/components/shared/icons';

const SETTINGS_PREVIEW_CATEGORIES = SETTINGS_CATEGORIES.slice(0, 5);

export interface ThemePreviewSettingsSectionProps {
  selectedComponentId?: ThemeComponentId;
  previewMode?: 'full' | 'component';
}

export function ThemePreviewSettingsSection(props: ThemePreviewSettingsSectionProps) {
  const show = (id: AppComponentId) =>
    shouldShowAppPreviewComponent(id, props.previewMode ?? 'full', props.selectedComponentId);

  const highlight = (id: AppComponentId) =>
    themePreviewHighlight(id, props.selectedComponentId, props.previewMode);

  const showSection = () => show('settingsTabPanel') || show('settingsCard') || show('settingsRow');

  const showDesktopLayout = () => show('settingsTabPanel') || show('settingsRow');

  const showHubCards = () => show('settingsCard') && !show('settingsTabPanel');

  const settingsExpanded = () => {
    const mode = props.previewMode ?? 'full';
    const id = props.selectedComponentId;
    return (
      mode === 'component' &&
      (id === 'settingsTabPanel' || id === 'settingsCard' || id === 'settingsRow')
    );
  };

  const hubCards = () => (
    <ul class="flex w-full min-w-0 flex-col gap-2">
      <For each={SETTINGS_PREVIEW_CATEGORIES.slice(0, 3)}>
        {(cat) => (
          <li class="w-full min-w-0">
            <SettingsThemedHubCard
              class={cn(
                bookshelfCompactListCardClass('h-16 w-full items-center'),
                highlight('settingsCard'),
              )}
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <SettingsCategoryIcon categoryId={cat.id} class="h-5 w-5" />
              </span>
              <div class="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden text-left">
                <span
                  class={cn(
                    'truncate font-medium',
                    themePreviewTextClasses('settingsCard').primary,
                  )}
                >
                  {cat.label}
                </span>
                <span
                  class={cn(
                    'truncate text-xs',
                    themePreviewTextClasses('settingsCard').muted,
                  )}
                >
                  {cat.description}
                </span>
              </div>
              <span class="flex shrink-0 items-center pr-1.5 text-muted-foreground">
                <ChevronRightIcon class="h-4 w-4" />
              </span>
            </SettingsThemedHubCard>
          </li>
        )}
      </For>
    </ul>
  );

  return (
    <Show when={showSection()}>
      <Show when={showHubCards()}>
        <div
          class={cn(
            'flex w-full flex-col gap-2 rounded-xl border border-border/50 p-2',
            settingsExpanded() && 'min-h-[220px] flex-1',
          )}
        >
          {hubCards()}
        </div>
      </Show>

      <Show when={showDesktopLayout()}>
        <div
          class={cn(
            'flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border/50',
            themePreviewSurfaceShellClass('settingsTabPanel'),
            highlight('settingsTabPanel'),
            settingsExpanded() && 'min-h-[220px] flex-1',
          )}
        >
          <Show when={show('pageToolbar')}>
            <ThemedPreviewSurface
              componentId="pageToolbar"
              class={cn('shrink-0 space-y-3 px-4 pt-3', highlight('pageToolbar'))}
            >
              <div class="flex min-w-0 items-center justify-between gap-4">
                <PageToolbarTitleText title="设置" description="自定义你的阅读体验" />
                <div class="flex shrink-0 gap-2">
                  <div class="h-9 w-9 rounded-md bg-muted/70" />
                </div>
              </div>
              <Show when={show('settingsTabPanel')}>
                <Tabs value="appearance" class="w-full">
                  <TabsList class="flex h-auto w-full flex-wrap gap-1 p-1">
                    <For each={SETTINGS_PREVIEW_CATEGORIES}>
                      {(cat) => (
                        <TabsTrigger
                          value={cat.id}
                          class="min-w-0 flex-1 truncate px-2 text-xs sm:text-sm"
                        >
                          {cat.label}
                        </TabsTrigger>
                      )}
                    </For>
                  </TabsList>
                </Tabs>
              </Show>
            </ThemedPreviewSurface>
          </Show>

          <ThemedPreviewRegion
            componentId="settingsTabPanel"
            class={cn('relative min-h-[120px] flex-1', mainShellPageScroll)}
            contentClass="relative z-1 flex min-h-0 flex-col gap-2 p-2"
          >
            <Show when={show('settingsTabPanel')}>
              <div
                class={cn(
                  'rounded-lg border border-dashed border-border/60 bg-muted/15 p-4 text-sm',
                  themePreviewTextClasses('settingsTabPanel').muted,
                )}
              >
                「外观与主题」分类内容区 — 设置项列表占位
              </div>
            </Show>

            <Show when={show('settingsRow')}>
              <ThemedPreviewSurface
                componentId="settingsRow"
                class={cn(
                  'rounded-xl border border-border p-4',
                  themePreviewSurfaceShellClass('settingsRow'),
                  highlight('settingsRow'),
                )}
              >
                <div class="flex items-center justify-between gap-4">
                  <div class="min-w-0">
                    <p class={cn('font-medium', themePreviewTextClasses('settingsRow').primary)}>
                      跟随系统主题
                    </p>
                    <p class={cn('text-sm', themePreviewTextClasses('settingsRow').muted)}>
                      自动匹配系统浅色/深色模式
                    </p>
                  </div>
                  <div class="h-6 w-11 shrink-0 rounded-full bg-primary/20" />
                </div>
              </ThemedPreviewSurface>
            </Show>
          </ThemedPreviewRegion>
        </div>
      </Show>
    </Show>
  );
}

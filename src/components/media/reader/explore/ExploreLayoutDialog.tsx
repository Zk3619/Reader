import { appDialogScrollBodyMaxH70SpaceY4 } from '@/lib/ui/viewport-classes';
/**
 * 探索页布局偏好对话框
 */

import { createEffect, createSignal, For, onMount, Show } from 'solid-js';
import { setupAccessibilityListeners } from '@/utils/accessibility';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import {
  bookshelfCompactListViewModeOptions,
  bookshelfStandardListViewModeOptions,
  gridViewModeOptions,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import {
  defaultExplorePageLayoutSettings,
  explorePageLayoutStore,
  initExplorePageLayoutSettings,
  type ExploreDataDisplayMode,
  type ExploreDataLayoutMode,
  type ExplorePageLayoutSettings,
  type ExplorePaginationPreference,
  type ExploreSectionDisplayStyle,
  type ExploreSourceNavStyle,
} from '@/stores/explore-page-layout';
import { cn } from '@/lib/utils';

const sectionPanelClass =
  'rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3';

const sectionTitleClass = 'text-sm font-medium leading-none text-foreground';

function SettingToggleRow(props: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      class={cn(
        'flex items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors',
        props.disabled ? 'opacity-60' : 'hover:bg-background/60',
      )}
    >
      <Label
        for={props.id}
        class={cn(
          'text-sm font-normal leading-snug text-foreground',
          props.disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        {props.label}
      </Label>
      <Checkbox
        id={props.id}
        checked={props.checked}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    </div>
  );
}

export interface ExploreLayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 单书源发现页等场景：不展示书源选择偏好 */
  hideSourcePreferences?: boolean;
}

export function ExploreLayoutDialog(props: ExploreLayoutDialogProps) {
  const [localSettings, setLocalSettings] = createSignal<ExplorePageLayoutSettings>(
    defaultExplorePageLayoutSettings,
  );

  onMount(() => void initExplorePageLayoutSettings());

  onMount(() =>
    setupAccessibilityListeners({
      onDialogOpened: () => {},
    }),
  );

  createEffect(() => {
    if (props.open) {
      setLocalSettings({ ...explorePageLayoutStore.settings });
    }
  });

  function patchLocal(updates: Partial<ExplorePageLayoutSettings>) {
    setLocalSettings((prev) => ({ ...prev, ...updates }));
  }

  const sourceNavStyleOptions: { value: ExploreSourceNavStyle; label: string; hint: string }[] = [
    { value: 'dropdown', label: '书源下拉', hint: '在标题区点击下拉切换书源' },
    { value: 'tabs', label: '书源标签', hint: '在标题下方以标签栏切换书源' },
    { value: 'dialog', label: '书源弹窗', hint: '点击标题打开弹窗，可搜索并选择书源' },
  ];

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setLocalSettings({ ...explorePageLayoutStore.settings });
    }
    props.onOpenChange(open);
  };

  function handleConfirm() {
    if (props.hideSourcePreferences) {
      const local = localSettings();
      explorePageLayoutStore.updateSettings({
        sectionDisplayStyle: local.sectionDisplayStyle,
        dataDisplayMode: local.dataDisplayMode,
        showCover: local.showCover,
        paginationPreference: local.paginationPreference,
        dataLayoutMode: local.dataLayoutMode,
        cardListViewMode: local.cardListViewMode,
        cardGridViewMode: local.cardGridViewMode,
        spacing: local.spacing,
      });
    } else {
      explorePageLayoutStore.updateSettings(localSettings());
    }
    window.dispatchEvent(new CustomEvent('explore-layout-changed'));
    props.onOpenChange(false);
  }

  function handleCancel() {
    setLocalSettings({ ...explorePageLayoutStore.settings });
    props.onOpenChange(false);
  }

  const dataLayoutModeOptions: { value: ExploreDataLayoutMode; label: string; hint: string }[] = [
    {
      value: 'default',
      label: '默认布局',
      hint: '响应式卡片网格（1/2/3/4 列随窗口宽度变化）',
    },
    { value: 'text-list', label: '文本列表', hint: '纯文字行，适合快速浏览书名' },
    { value: 'card-list', label: '卡片列表', hint: '与书架列表相同的卡片行布局' },
    { value: 'card-grid', label: '卡片网格', hint: '与书架网格相同的封面卡片布局' },
  ];

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange}>
      <AppDialogContent class="max-w-lg">
        <AppDialogHeader>
          <AppDialogTitle>布局偏好</AppDialogTitle>
          <AppDialogDescription>
            {props.hideSourcePreferences
              ? '自定义发现页的分类与书籍展示方式'
              : '自定义探索页的书源、分类与书籍展示方式'}
          </AppDialogDescription>
        </AppDialogHeader>

        <AppDialogScrollBody class={appDialogScrollBodyMaxH70SpaceY4}>
          <Show when={!props.hideSourcePreferences}>
            <section class={sectionPanelClass}>
              <Label class={sectionTitleClass}>书源展示偏好</Label>
              <RadioGroup
                value={localSettings().sourceNavStyle}
                onChange={(value) =>
                  patchLocal({ sourceNavStyle: value as ExploreSourceNavStyle })
                }
                class="space-y-1"
              >
                <For each={sourceNavStyleOptions}>
                  {(option) => (
                    <RadioGroupItem value={option.value} class="items-start py-1">
                      <RadioGroupItemLabel class="flex-1 cursor-pointer">
                        <div class="text-sm">{option.label}</div>
                        <div class="text-xs text-muted-foreground">{option.hint}</div>
                      </RadioGroupItemLabel>
                    </RadioGroupItem>
                  )}
                </For>
              </RadioGroup>
            </section>
          </Show>

          <section class={sectionPanelClass}>
            <Label class={sectionTitleClass}>分类展示偏好</Label>
            <RadioGroup
              value={localSettings().sectionDisplayStyle}
              onChange={(value) =>
                patchLocal({ sectionDisplayStyle: value as ExploreSectionDisplayStyle })
              }
              class="flex flex-col gap-1.5"
            >
              <RadioGroupItem value="stacked">
                <RadioGroupItemLabel class="text-sm">堆叠</RadioGroupItemLabel>
              </RadioGroupItem>
              <RadioGroupItem value="tabs">
                <RadioGroupItemLabel class="text-sm">Tab 标签</RadioGroupItemLabel>
              </RadioGroupItem>
            </RadioGroup>
          </section>

          <section class={sectionPanelClass}>
            <Label class={sectionTitleClass}>数据展示偏好</Label>
            <RadioGroup
              value={localSettings().dataDisplayMode}
              onChange={(value) =>
                patchLocal({ dataDisplayMode: value as ExploreDataDisplayMode })
              }
              class="flex flex-col gap-1.5"
            >
              <RadioGroupItem value="detailed">
                <RadioGroupItemLabel class="text-sm">详细</RadioGroupItemLabel>
              </RadioGroupItem>
              <RadioGroupItem value="compact">
                <RadioGroupItemLabel class="text-sm">精简</RadioGroupItemLabel>
              </RadioGroupItem>
            </RadioGroup>
            <div class="divide-y divide-border/50 rounded-md border border-border/40 bg-background/40">
              <SettingToggleRow
                id="explore-show-cover"
                label="显示封面"
                checked={localSettings().showCover}
                disabled={localSettings().dataLayoutMode === 'text-list'}
                onChange={(checked) => patchLocal({ showCover: checked })}
              />
            </div>
            <Label class={cn(sectionTitleClass, 'pt-1')}>分页偏好</Label>
            <RadioGroup
              value={localSettings().paginationPreference}
              onChange={(value) =>
                patchLocal({ paginationPreference: value as ExplorePaginationPreference })
              }
              class="space-y-1"
            >
              <RadioGroupItem value="scroll" class="items-start py-1">
                <RadioGroupItemLabel class="flex-1 cursor-pointer">
                  <div class="text-sm">滚动加载</div>
                  <div class="text-xs text-muted-foreground">滚动到底部时自动加载更多</div>
                </RadioGroupItemLabel>
              </RadioGroupItem>
              <RadioGroupItem value="pagination" class="items-start py-1">
                <RadioGroupItemLabel class="flex-1 cursor-pointer">
                  <div class="text-sm">分页列表</div>
                  <div class="text-xs text-muted-foreground">点击「加载更多」按钮手动加载</div>
                </RadioGroupItemLabel>
              </RadioGroupItem>
            </RadioGroup>
          </section>

          <section class={sectionPanelClass}>
            <Label class={sectionTitleClass}>数据布局偏好</Label>
            <RadioGroup
              value={localSettings().dataLayoutMode}
              onChange={(value) => patchLocal({ dataLayoutMode: value as ExploreDataLayoutMode })}
              class="space-y-1"
            >
              <For each={dataLayoutModeOptions}>
                {(option) => (
                  <RadioGroupItem value={option.value} class="items-start py-1">
                    <RadioGroupItemLabel class="flex-1 cursor-pointer">
                      <div class="text-sm">{option.label}</div>
                      <div class="text-xs text-muted-foreground">{option.hint}</div>
                    </RadioGroupItemLabel>
                  </RadioGroupItem>
                )}
              </For>
            </RadioGroup>

            <Show when={localSettings().dataLayoutMode === 'card-list'}>
              <div class="space-y-2 pt-1">
                <p class="text-xs font-medium text-muted-foreground">卡片列表列数（与书架一致）</p>
                <RadioGroup
                  value={localSettings().cardListViewMode}
                  onChange={(value) =>
                    patchLocal({ cardListViewMode: value as ViewMode })
                  }
                  class="grid grid-cols-2 gap-x-3 gap-y-1"
                >
                  <For each={bookshelfStandardListViewModeOptions}>
                    {(option) => (
                      <RadioGroupItem value={option.value}>
                        <RadioGroupItemLabel class="text-xs">{option.label}</RadioGroupItemLabel>
                      </RadioGroupItem>
                    )}
                  </For>
                  <For each={bookshelfCompactListViewModeOptions}>
                    {(option) => (
                      <RadioGroupItem value={option.value}>
                        <RadioGroupItemLabel class="text-xs">{option.label}</RadioGroupItemLabel>
                      </RadioGroupItem>
                    )}
                  </For>
                </RadioGroup>
              </div>
            </Show>

            <Show when={localSettings().dataLayoutMode === 'card-grid'}>
              <div class="space-y-2 pt-1">
                <p class="text-xs font-medium text-muted-foreground">卡片网格列数（与书架一致）</p>
                <RadioGroup
                  value={localSettings().cardGridViewMode}
                  onChange={(value) =>
                    patchLocal({ cardGridViewMode: value as ViewMode })
                  }
                  class="grid grid-cols-2 gap-x-3 gap-y-1"
                >
                  <For each={gridViewModeOptions}>
                    {(option) => (
                      <RadioGroupItem value={option.value}>
                        <RadioGroupItemLabel class="text-xs">{option.label}</RadioGroupItemLabel>
                      </RadioGroupItem>
                    )}
                  </For>
                </RadioGroup>
              </div>
            </Show>
          </section>
        </AppDialogScrollBody>

        <AppDialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button onClick={handleConfirm}>确定</Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
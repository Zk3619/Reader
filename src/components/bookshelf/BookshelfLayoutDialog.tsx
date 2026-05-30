/**
 * 书架布局设置对话框
 * 对应 UI.md 中的书架布局设置功能
 */

import { createSignal, For, createEffect, onMount } from 'solid-js';
import { setupAccessibilityListeners } from '@/utils/accessibility';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import {
  bookshelfLayoutStore,
  type GroupStyle,
  type ViewMode,
  type SortMode,
  type BookTitleDisplay,
} from '@/stores/bookshelf-layout';
import {
  bookshelfCompactListViewModeOptions,
  bookshelfStandardListViewModeOptions,
  gridViewModeOptions,
  isGridViewMode,
  isListViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
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

interface BookshelfLayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookshelfLayoutDialog(props: BookshelfLayoutDialogProps) {
  const [localSettings, setLocalSettings] = createSignal(bookshelfLayoutStore.settings);
  const [spacingValue, setSpacingValue] = createSignal(bookshelfLayoutStore.settings.spacing);
  const [groupStyleSelectOpen, setGroupStyleSelectOpen] = createSignal(false);

  onMount(() =>
    setupAccessibilityListeners({
      onDialogOpened: () => setGroupStyleSelectOpen(false),
    }),
  );

  createEffect(() => {
    if (props.open) {
      setLocalSettings(bookshelfLayoutStore.settings);
      setSpacingValue(bookshelfLayoutStore.settings.spacing);
    }
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setLocalSettings(bookshelfLayoutStore.settings);
      setSpacingValue(bookshelfLayoutStore.settings.spacing);
      setGroupStyleSelectOpen(false);
    } else {
      setLocalSettings(bookshelfLayoutStore.settings);
      setSpacingValue(bookshelfLayoutStore.settings.spacing);
      setGroupStyleSelectOpen(false);
    }
    props.onOpenChange(open);
  };

  function handleConfirm() {
    bookshelfLayoutStore.updateSettings(localSettings());
    window.dispatchEvent(new CustomEvent('bookshelf-layout-changed'));
    props.onOpenChange(false);
  }

  function handleCancel() {
    setLocalSettings(bookshelfLayoutStore.settings);
    setSpacingValue(bookshelfLayoutStore.settings.spacing);
    props.onOpenChange(false);
  }

  const groupStyleOptions: { value: GroupStyle; label: string }[] = [
    { value: 'normal', label: '常规' },
    { value: 'tabs', label: '标签' },
    { value: 'dropdown', label: '下拉框' },
  ];

  const sortModeOptions: { value: SortMode; label: string }[] = [
    { value: 'read-time', label: '按阅读时间' },
    { value: 'update-time', label: '按更新时间' },
    { value: 'book-name', label: '按书名' },
    { value: 'manual', label: '手动排序' },
    { value: 'comprehensive', label: '综合排序' },
    { value: 'author', label: '按作者' },
  ];

  const bookTitleDisplayOptions: { value: BookTitleDisplay; label: string }[] = [
    { value: 'show', label: '显示' },
    { value: 'hide', label: '隐藏' },
    { value: 'overlay', label: '叠加' },
  ];

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>书架布局</AppDialogTitle>
          <AppDialogDescription>自定义书架和分组的显示方式</AppDialogDescription>
        </AppDialogHeader>

        <div class="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <section class={sectionPanelClass}>
            <Label class={sectionTitleClass}>分组样式</Label>
            <AppSelect
              value={localSettings().groupStyle}
              onChange={(v) => setLocalSettings({ ...localSettings(), groupStyle: (v || 'normal') as GroupStyle })}
              options={groupStyleOptions.map((o) => o.value)}
              placeholder="选择分组样式"
              open={groupStyleSelectOpen()}
              onOpenChange={setGroupStyleSelectOpen}
              itemComponent={(itemProps) => {
                const option = groupStyleOptions.find((o) => o.value === itemProps.item.rawValue);
                return (
                  <AppSelectItem item={itemProps.item}>
                    {option?.label ?? itemProps.item.rawValue}
                  </AppSelectItem>
                );
              }}
            >
              <AppSelectTrigger aria-label="分组样式">
                <AppSelectValue<GroupStyle>>
                  {(state) => {
                    const v = state.selectedOption();
                    const opt = groupStyleOptions.find((o) => o.value === v);
                    return opt?.label ?? v ?? '常规';
                  }}
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
          </section>

          <section class={sectionPanelClass}>
            <Label class={sectionTitleClass}>显示选项</Label>
            <div class="divide-y divide-border/50 rounded-md border border-border/40 bg-background/40">
              <SettingToggleRow
                id="show-unread-flag"
                label="显示未读标志"
                checked={localSettings().showUnreadFlag}
                onChange={(checked) =>
                  setLocalSettings({ ...localSettings(), showUnreadFlag: checked })
                }
              />
              <SettingToggleRow
                id="show-last-update-time"
                label="显示上次更新时间"
                checked={localSettings().showLastUpdateTime}
                onChange={(checked) =>
                  setLocalSettings({ ...localSettings(), showLastUpdateTime: checked })
                }
              />
              <SettingToggleRow
                id="show-pending-update-count"
                label="显示等待更新数量"
                checked={localSettings().showPendingUpdateCount}
                onChange={(checked) =>
                  setLocalSettings({ ...localSettings(), showPendingUpdateCount: checked })
                }
              />
              <SettingToggleRow
                id="show-quick-scrollbar"
                label="显示快速滚动按钮"
                checked={localSettings().showQuickScrollbar}
                onChange={(checked) =>
                  setLocalSettings({ ...localSettings(), showQuickScrollbar: checked })
                }
              />
              <SettingToggleRow
                id="enable-drag-sort"
                label="启用拖拽排序"
                checked={localSettings().enableDragSort}
                onChange={(checked) =>
                  setLocalSettings({ ...localSettings(), enableDragSort: checked })
                }
              />
            </div>
            <p class="text-xs text-muted-foreground">
              拖拽排序需在「书籍排序」中选择「手动排序」后生效；关闭后书架页与分组页均不可拖拽调整顺序。
            </p>
          </section>

          <div class="grid gap-4 sm:grid-cols-2">
            <section class={sectionPanelClass}>
              <Label class={sectionTitleClass}>视图</Label>
              <RadioGroup
                value={localSettings().viewMode}
                onChange={(value) =>
                  setLocalSettings({ ...localSettings(), viewMode: value as ViewMode })
                }
                class="w-full"
              >
                <div class="grid grid-cols-2 items-start gap-3">
                  <div class="space-y-3">
                    <div class="space-y-2">
                      <p class="text-xs font-medium text-muted-foreground">列表</p>
                      <div class="flex flex-col gap-1.5">
                        <For each={bookshelfStandardListViewModeOptions}>
                          {(option) => (
                            <RadioGroupItem value={option.value}>
                              <RadioGroupItemLabel class="text-sm">{option.label}</RadioGroupItemLabel>
                            </RadioGroupItem>
                          )}
                        </For>
                      </div>
                    </div>
                    <div class="space-y-2">
                      <p class="text-xs font-medium text-muted-foreground">紧凑列表</p>
                      <div class="flex flex-col gap-1.5">
                        <For each={bookshelfCompactListViewModeOptions}>
                          {(option) => (
                            <RadioGroupItem value={option.value}>
                              <RadioGroupItemLabel class="text-sm">{option.label}</RadioGroupItemLabel>
                            </RadioGroupItem>
                          )}
                        </For>
                      </div>
                    </div>
                  </div>
                  <div class="space-y-2">
                    <p class="text-xs font-medium text-muted-foreground">网格</p>
                    <div class="flex flex-col gap-1.5">
                      <For each={gridViewModeOptions}>
                        {(option) => (
                          <RadioGroupItem value={option.value}>
                            <RadioGroupItemLabel class="text-sm">{option.label}</RadioGroupItemLabel>
                          </RadioGroupItem>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              </RadioGroup>
            </section>

            <section class={sectionPanelClass}>
              <Label class={sectionTitleClass}>书籍排序</Label>
              <RadioGroup
                value={localSettings().sortMode}
                onChange={(value) =>
                  setLocalSettings({ ...localSettings(), sortMode: value as SortMode })
                }
                class="flex flex-col gap-1.5"
              >
                <For each={sortModeOptions}>
                  {(option) => (
                    <RadioGroupItem value={option.value}>
                      <RadioGroupItemLabel class="text-sm">{option.label}</RadioGroupItemLabel>
                    </RadioGroupItem>
                  )}
                </For>
              </RadioGroup>
            </section>
          </div>

          <section
            class={cn(
              sectionPanelClass,
              !isListViewMode(localSettings().viewMode) && 'opacity-60',
            )}
          >
            <Label class={sectionTitleClass}>列表与紧凑列表下的封面点击预览</Label>
            <p class="text-xs text-muted-foreground">
              仅对列表与紧凑列表生效；网格布局下不可用。
            </p>
            <div class="divide-y divide-border/50 rounded-md border border-border/40 bg-background/40">
              <SettingToggleRow
                id="cover-click-preview"
                label="封面点击预览"
                checked={localSettings().coverClickPreview}
                disabled={!isListViewMode(localSettings().viewMode)}
                onChange={(checked) =>
                  setLocalSettings({ ...localSettings(), coverClickPreview: checked })
                }
              />
            </div>
          </section>

          <section
            class={cn(
              sectionPanelClass,
              !isGridViewMode(localSettings().viewMode) && 'opacity-60',
            )}
          >
            <Label class={sectionTitleClass}>网格布局下的书名/作者/分组名</Label>
            <p class="text-xs text-muted-foreground">
              仅对网格视图生效；列表与紧凑列表始终显示名称。
            </p>
            <RadioGroup
              value={localSettings().bookTitleDisplay}
              onChange={(value) => {
                setLocalSettings({ ...localSettings(), bookTitleDisplay: value as BookTitleDisplay });
              }}
              class="flex flex-wrap gap-x-6 gap-y-2"
              disabled={!isGridViewMode(localSettings().viewMode)}
            >
              <For each={bookTitleDisplayOptions}>
                {(option) => (
                  <RadioGroupItem value={option.value}>
                    <RadioGroupItemLabel class="text-sm">{option.label}</RadioGroupItemLabel>
                  </RadioGroupItem>
                )}
              </For>
            </RadioGroup>
          </section>

          <section class={sectionPanelClass}>
            <div class="flex items-baseline justify-between gap-2">
              <Label class={sectionTitleClass}>列表 / 网格间距</Label>
              <span class="tabular-nums text-sm text-muted-foreground">{spacingValue()}</span>
            </div>
            <div class="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                class="size-8 shrink-0"
                onClick={() => {
                  const newValue = Math.max(0, spacingValue() - 1);
                  setSpacingValue(newValue);
                  setLocalSettings({ ...localSettings(), spacing: newValue });
                }}
                disabled={spacingValue() <= 0}
                aria-label="减小列表与网格间距"
              >
                <span class="text-sm">-</span>
              </Button>
              <Slider
                value={[spacingValue()]}
                onChange={(values: number[]) => {
                  if (Array.isArray(values) && values.length > 0) {
                    const newValue = values[0];
                    setSpacingValue(newValue);
                    setLocalSettings({ ...localSettings(), spacing: newValue });
                  }
                }}
                minValue={0}
                maxValue={24}
                step={1}
                class="min-w-0 flex-1"
              >
                <SliderTrack>
                  <SliderFill />
                </SliderTrack>
                <SliderThumb />
              </Slider>
              <Button
                type="button"
                variant="outline"
                size="icon"
                class="size-8 shrink-0"
                onClick={() => {
                  const newValue = Math.min(24, spacingValue() + 1);
                  setSpacingValue(newValue);
                  setLocalSettings({ ...localSettings(), spacing: newValue });
                }}
                disabled={spacingValue() >= 24}
                aria-label="增大列表与网格间距"
              >
                <span class="text-sm">+</span>
              </Button>
            </div>
          </section>
        </div>

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

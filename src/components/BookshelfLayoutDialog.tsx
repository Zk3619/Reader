/**
 * 书架布局设置对话框
 * 对应 UI.md 中的书架布局设置功能
 */

import { createSignal, For, createEffect } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from './ui/radio-group';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Slider, SliderTrack, SliderFill, SliderThumb } from './ui/slider';
import {
  Select,
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectListbox,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  bookshelfLayoutStore,
  type GroupStyle,
  type ViewMode,
  type SortMode,
  type BookTitleDisplay,
} from '@/stores/bookshelf-layout';

interface BookshelfLayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookshelfLayoutDialog(props: BookshelfLayoutDialogProps) {
  const [localSettings, setLocalSettings] = createSignal(bookshelfLayoutStore.settings);
  const [spacingValue, setSpacingValue] = createSignal(bookshelfLayoutStore.settings.spacing);
  const [groupStyleSelectOpen, setGroupStyleSelectOpen] = createSignal(false);

  // 每当对话框变为打开状态时，从 store 同步到本地（避免显示上次未确认的修改）
  createEffect(() => {
    if (props.open) {
      setLocalSettings(bookshelfLayoutStore.settings);
      setSpacingValue(bookshelfLayoutStore.settings.spacing);
    }
  });

  // 监听设置变化：打开时从 store 同步到本地，关闭时丢弃未确认的修改（重置本地为 store）
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // 关闭时（点击遮罩/关闭按钮）丢弃未确认的修改，重置为当前 store
      setLocalSettings(bookshelfLayoutStore.settings);
      setSpacingValue(bookshelfLayoutStore.settings.spacing);
    }
    props.onOpenChange(open);
    if (open) {
      // 打开时从 store 同步到本地
      setLocalSettings(bookshelfLayoutStore.settings);
      setSpacingValue(bookshelfLayoutStore.settings.spacing);
      // Dialog 打开时，立即强制关闭所有 Select/DropdownMenu 并移除焦点
      requestAnimationFrame(() => {
        setGroupStyleSelectOpen(false);
        blurActiveElement();
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement && activeElement !== document.body) {
          activeElement.blur();
        }
      });
    }
  };

  /**
   * 处理确认
   */
  function handleConfirm() {
    bookshelfLayoutStore.updateSettings(localSettings());
    // 触发事件通知书架页面刷新排序
    window.dispatchEvent(new CustomEvent('bookshelf-layout-changed'));
    props.onOpenChange(false);
  }

  /**
   * 处理取消
   */
  function handleCancel() {
    // 重置为当前设置
    setLocalSettings(bookshelfLayoutStore.settings);
    setSpacingValue(bookshelfLayoutStore.settings.spacing);
    props.onOpenChange(false);
  }

  /**
   * 分组样式选项
   */
  const groupStyleOptions: { value: GroupStyle; label: string }[] = [
    { value: 'normal', label: '常规' },
    { value: 'tabs', label: '标签' },
    { value: 'dropdown', label: '下拉框' },
  ];

  /**
   * 视图模式选项
   */
  const viewModeOptions: { value: ViewMode; label: string }[] = [
    { value: 'list', label: '列表' },
    { value: 'list-2', label: '列表二列' },
    { value: 'compact', label: '紧凑列表' },
    { value: 'compact-2', label: '紧凑列表二列' },
    { value: 'grid-2', label: '网格二列' },
    { value: 'grid-3', label: '网格三列' },
    { value: 'grid-4', label: '网格四列' },
    { value: 'grid-5', label: '网格五列' },
    { value: 'grid-6', label: '网格六列' },
  ];

  /**
   * 排序方式选项
   */
  const sortModeOptions: { value: SortMode; label: string }[] = [
    { value: 'read-time', label: '按阅读时间' },
    { value: 'update-time', label: '按更新时间' },
    { value: 'book-name', label: '按书名' },
    { value: 'manual', label: '手动排序' },
    { value: 'comprehensive', label: '综合排序' },
    { value: 'author', label: '按作者' },
  ];

  /**
   * 书名/分组名显示选项
   */
  const bookTitleDisplayOptions: { value: BookTitleDisplay; label: string }[] = [
    { value: 'show', label: '显示' },
    { value: 'hide', label: '隐藏' },
    { value: 'overlay', label: '叠加' },
  ];

  return (
      <Dialog 
        open={props.open} 
        onOpenChange={(open) => {
          handleOpenChange(open);
          if (open) {
            // 触发事件通知其他组件
            window.dispatchEvent(new CustomEvent('dialog-opened'));
          }
        }}
      >
      <DialogContent class="max-w-[calc(100vw-2rem)] sm:w-[70vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>书架布局</DialogTitle>
          <DialogDescription>
            自定义书架和分组的显示方式
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-6 py-4">
          {/* 分组样式 */}
          <div class="space-y-2">
            <Label class="text-sm font-semibold">分组样式</Label>
            <Select
              value={localSettings().groupStyle}
              onChange={(v) => setLocalSettings({ ...localSettings(), groupStyle: (v || 'normal') as GroupStyle })}
              options={groupStyleOptions.map((o) => o.value)}
              placeholder="选择分组样式"
              open={groupStyleSelectOpen()}
              onOpenChange={setGroupStyleSelectOpen}
              itemComponent={(itemProps) => {
                const option = groupStyleOptions.find((o) => o.value === itemProps.item.rawValue);
                return (
                  <SelectItem class="pl-2" item={itemProps.item}>
                    {option?.label ?? itemProps.item.rawValue}
                  </SelectItem>
                );
              }}
            >
              <SelectTrigger class="w-full" aria-label="分组样式">
                <SelectValue<GroupStyle>>
                  {(state) => {
                    const v = state.selectedOption();
                    const opt = groupStyleOptions.find((o) => o.value === v);
                    return opt?.label ?? v ?? '常规';
                  }}
                </SelectValue>
                <SelectIcon />
              </SelectTrigger>
              <SelectContent>
                <SelectListbox />
              </SelectContent>
            </Select>
          </div>

          {/* 显示选项 */}
          <div class="space-y-3">
            <Label class="text-sm font-semibold">显示选项</Label>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <Label for="show-unread-flag" class="text-sm font-normal cursor-pointer">
                  显示未读标志
                </Label>
                <Checkbox
                  id="show-unread-flag"
                  checked={localSettings().showUnreadFlag}
                  onChange={(checked) => {
                    setLocalSettings({ ...localSettings(), showUnreadFlag: checked });
                  }}
                />
              </div>
              <div class="flex items-center justify-between">
                <Label for="show-last-update-time" class="text-sm font-normal cursor-pointer">
                  显示上次更新时间
                </Label>
                <Checkbox
                  id="show-last-update-time"
                  checked={localSettings().showLastUpdateTime}
                  onChange={(checked) => {
                    setLocalSettings({ ...localSettings(), showLastUpdateTime: checked });
                  }}
                />
              </div>
              <div class="flex items-center justify-between">
                <Label for="show-pending-update-count" class="text-sm font-normal cursor-pointer">
                  显示等待更新数量
                </Label>
                <Checkbox
                  id="show-pending-update-count"
                  checked={localSettings().showPendingUpdateCount}
                  onChange={(checked) => {
                    setLocalSettings({ ...localSettings(), showPendingUpdateCount: checked });
                  }}
                />
              </div>
              <div class="flex items-center justify-between">
                <Label for="show-quick-scrollbar" class="text-sm font-normal cursor-pointer">
                  显示快速滚动条
                </Label>
                <Checkbox
                  id="show-quick-scrollbar"
                  checked={localSettings().showQuickScrollbar}
                  onChange={(checked) => {
                    setLocalSettings({ ...localSettings(), showQuickScrollbar: checked });
                  }}
                />
              </div>
            </div>
          </div>

          {/* 视图和排序 */}
          <div class="grid grid-cols-2 gap-6">
            {/* 视图 */}
            <div class="space-y-3">
              <Label class="text-sm font-semibold">视图</Label>
              <RadioGroup
                value={localSettings().viewMode}
                onChange={(value) => {
                  setLocalSettings({ ...localSettings(), viewMode: value as ViewMode });
                }}
              >
                <For each={viewModeOptions}>
                  {(option) => (
                    <RadioGroupItem value={option.value}>
                      <RadioGroupItemLabel class="text-sm">{option.label}</RadioGroupItemLabel>
                    </RadioGroupItem>
                  )}
                </For>
              </RadioGroup>
            </div>

            {/* 排序 */}
            <div class="space-y-3">
              <Label class="text-sm font-semibold">排序</Label>
              <RadioGroup
                value={localSettings().sortMode}
                onChange={(value) => {
                  setLocalSettings({ ...localSettings(), sortMode: value as SortMode });
                }}
              >
                <For each={sortModeOptions}>
                  {(option) => (
                    <RadioGroupItem value={option.value}>
                      <RadioGroupItemLabel class="text-sm">{option.label}</RadioGroupItemLabel>
                    </RadioGroupItem>
                  )}
                </For>
              </RadioGroup>
            </div>
          </div>

          {/* 书名/分组名显示 */}
          <div class="space-y-3">
            <Label class="text-sm font-semibold">书名/分组名</Label>
            <RadioGroup
              value={localSettings().bookTitleDisplay}
              onChange={(value) => {
                setLocalSettings({ ...localSettings(), bookTitleDisplay: value as BookTitleDisplay });
              }}
            >
              <div class="flex gap-4">
                <For each={bookTitleDisplayOptions}>
                  {(option) => (
                    <RadioGroupItem value={option.value}>
                      <RadioGroupItemLabel class="text-sm">{option.label}</RadioGroupItemLabel>
                    </RadioGroupItem>
                  )}
                </For>
              </div>
            </RadioGroup>
          </div>

          {/* 网格间距 */}
          <div class="space-y-3">
            <div class="flex items-center">
              <Label class="text-sm font-semibold">网格间距</Label>
              <div class="flex items-center gap-2 ml-2">
                <Button
                  variant="outline"
                  size="icon"
                  class="h-7 w-14"
                  onClick={() => {
                    const newValue = Math.max(0, spacingValue() - 1);
                    setSpacingValue(newValue);
                    setLocalSettings({ ...localSettings(), spacing: newValue });
                  }}
                >
                  <span class="text-sm">-</span>
                </Button>
                <div class="flex-1">
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
                    class="w-[15vw]"
                  >
                    <SliderTrack>
                      <SliderFill />
                    </SliderTrack>
                    <SliderThumb />
                  </Slider>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  class="h-7 w-7"
                  onClick={() => {
                    const newValue = Math.min(24, spacingValue() + 1);
                    setSpacingValue(newValue);
                    setLocalSettings({ ...localSettings(), spacing: newValue });
                  }}
                >
                  <span class="text-sm">+</span>
                </Button>
                <span class="text-sm text-muted-foreground">
                  {spacingValue()}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter class="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button onClick={handleConfirm}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

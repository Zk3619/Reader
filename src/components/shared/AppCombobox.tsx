/**
 * 应用内 Combobox：外部过滤选项，无匹配项时不展开下拉（不使用 allowsEmptyCollection）。
 */

import { createFilter } from '@kobalte/core';
import * as ComboboxPrimitive from '@kobalte/core/combobox';
import type { Component } from 'solid-js';
import { createMemo, splitProps } from 'solid-js';

import {
  Combobox,
  ComboboxControl,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemLabel,
  ComboboxTrigger,
} from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { overlayLayerZ } from '@/lib/ui/overlay-layer-active';
import { useOverlayPortalMount } from '@/lib/ui/overlay-portal-mount';
import { popperMenuPanelShell, type ScrollGutterMode } from '@/lib/ui/viewport-classes';
import { PopperScrollViewport } from '@/components/shared/PopperScrollViewport';
import { AppTextInputContextMenu } from '@/components/shared/AppTextInputContextMenu';

const APP_COMBOBOX_ITEM_CLASS = 'w-full min-w-0 overflow-hidden';
const APP_COMBOBOX_ITEM_LABEL_CLASS = 'min-w-0 flex-1 truncate';
const APP_COMBOBOX_CONTROL_CLASS = 'min-w-0 w-full';
const APP_COMBOBOX_INPUT_CLASS = 'min-w-0 flex-1 truncate';

export type AppComboboxReclickSelected = 'keep' | 'clear';

export type AppComboboxProps = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  class?: string;
  /** 下拉层 z-index，对话框内可传 portalZClass 并叠加更高层级 */
  contentClass?: string;
  /**
   * 滚动条预留：both 两侧 / single 单侧 / auto 自动（默认）
   */
  scrollGutter?: ScrollGutterMode;
  /**
   * 为 true 时不按当前输入过滤选项（下拉始终展示完整列表；
   * 用于倍速/音调等：输入框显示实际值，选项仅为预设）。
   */
  disableFilter?: boolean;
  /**
   * 为 true 时不下拉 Portal（内容留在当前 DOM 树）。
   * 嵌在 Popover 内时必须开启，否则 Portal 挂载会触发 Popover 的 interactOutside 立刻关闭。
   */
  disablePortal?: boolean;
  /**
   * 再次点击已选中项：`'keep'`（默认）保持；`'clear'` 清空并由 onChange('') 通知。
   */
  reclickSelected?: AppComboboxReclickSelected;
  'aria-label'?: string;
};

export const AppCombobox: Component<AppComboboxProps> = (props) => {
  const mount = useOverlayPortalMount();
  const [local] = splitProps(props, [
    'options',
    'value',
    'onChange',
    'placeholder',
    'class',
    'contentClass',
    'scrollGutter',
    'disableFilter',
    'disablePortal',
    'reclickSelected',
    'aria-label',
  ]);

  const filter = createFilter({ sensitivity: 'base' });

  const filteredOptions = createMemo(() => {
    if (local.disableFilter) return local.options;
    const q = local.value.trim();
    if (!q) return local.options;
    return local.options.filter((opt) => filter.contains(opt, q));
  });

  const content = () => (
    <ComboboxPrimitive.Content
      data-kb-combobox-content=""
      class={cn(
        popperMenuPanelShell,
        overlayLayerZ().popper,
        'relative isolate overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
        local.contentClass,
      )}
    >
      <ThemedComponentBackground componentId="combobox" />
      <PopperScrollViewport class="relative z-1 px-1" scrollGutter={local.scrollGutter}>
        <ComboboxPrimitive.Listbox class="m-0 p-0" />
      </PopperScrollViewport>
    </ComboboxPrimitive.Content>
  );

  return (
    <Combobox
      class={cn('min-w-0', local.class)}
      options={filteredOptions()}
      value={local.value || null}
      onChange={(v) => local.onChange(v ?? '')}
      onInputChange={(v) => local.onChange(v)}
      placeholder={local.placeholder}
      noResetInputOnBlur
      modal={false}
      disallowEmptySelection={local.reclickSelected !== 'clear'}
      itemComponent={(itemProps) => (
        <ComboboxItem item={itemProps.item} class={APP_COMBOBOX_ITEM_CLASS}>
          <ComboboxItemLabel class={APP_COMBOBOX_ITEM_LABEL_CLASS}>
            {itemProps.item.rawValue}
          </ComboboxItemLabel>
        </ComboboxItem>
      )}
    >
      <ComboboxControl class={APP_COMBOBOX_CONTROL_CLASS} aria-label={local['aria-label']}>
        <AppTextInputContextMenu triggerClass="flex min-w-0 flex-1">
          <ComboboxInput class={APP_COMBOBOX_INPUT_CLASS} />
        </AppTextInputContextMenu>
        <ComboboxTrigger />
      </ComboboxControl>
      {local.disablePortal ? (
        content()
      ) : (
        <ComboboxPrimitive.Portal mount={mount}>{content()}</ComboboxPrimitive.Portal>
      )}
    </Combobox>
  );
};

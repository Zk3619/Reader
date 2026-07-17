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
  ComboboxTrigger,
} from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { overlayLayerZ } from '@/lib/ui/overlay-layer-active';
import { useOverlayPortalMount } from '@/lib/ui/overlay-portal-mount';
import { popperMenuPanelShell, type ScrollGutterMode } from '@/lib/ui/viewport-classes';
import { PopperScrollViewport } from '@/components/shared/PopperScrollViewport';

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
    'aria-label',
  ]);

  const filter = createFilter({ sensitivity: 'base' });

  const filteredOptions = createMemo(() => {
    const q = local.value.trim();
    if (!q) return local.options;
    return local.options.filter((opt) => filter.contains(opt, q));
  });

  return (
    <Combobox
      class={local.class}
      options={filteredOptions()}
      value={local.value || null}
      onChange={(v) => local.onChange(v ?? '')}
      onInputChange={(v) => local.onChange(v)}
      placeholder={local.placeholder}
      noResetInputOnBlur
      modal={false}
      itemComponent={(itemProps) => (
        <ComboboxItem item={itemProps.item}>{itemProps.item.rawValue}</ComboboxItem>
      )}
    >
      <ComboboxControl aria-label={local['aria-label']}>
        <ComboboxInput />
        <ComboboxTrigger />
      </ComboboxControl>
      <ComboboxPrimitive.Portal mount={mount}>
        <ComboboxPrimitive.Content
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
      </ComboboxPrimitive.Portal>
    </Combobox>
  );
};

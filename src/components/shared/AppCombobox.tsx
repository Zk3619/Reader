/**
 * 应用内 Combobox：外部过滤选项，无匹配项时不展开下拉（不使用 allowsEmptyCollection）。
 */

import { createFilter } from '@kobalte/core';
import type { Component } from 'solid-js';
import { createMemo, splitProps } from 'solid-js';

import {
  Combobox,
  ComboboxContent,
  ComboboxControl,
  ComboboxInput,
  ComboboxItem,
  ComboboxTrigger,
} from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { useOverlayLayerZ } from '@/lib/ui/overlay-layer-active';
import { useOverlayPortalMount } from '@/lib/ui/overlay-portal-mount';

export type AppComboboxProps = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  class?: string;
  /** 下拉层 z-index，对话框内可传 portalZClass 并叠加更高层级 */
  contentClass?: string;
  'aria-label'?: string;
};

export const AppCombobox: Component<AppComboboxProps> = (props) => {
  const layer = useOverlayLayerZ();
  const mount = useOverlayPortalMount();
  const [local] = splitProps(props, [
    'options',
    'value',
    'onChange',
    'placeholder',
    'class',
    'contentClass',
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
      <ComboboxContent mount={mount} class={cn(layer.popper, local.contentClass)} />
    </Combobox>
  );
};

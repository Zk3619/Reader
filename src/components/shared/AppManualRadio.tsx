/**
 * 手动单选组合（与书架「更多」下拉内单选一致：按钮 + 圆点指示，无 Kobalte RadioGroup / 原生 radio）。
 * 指示器与选项行使用固定占位，避免选中切换时 DOM 或边框变化导致布局塌缩。
 */

import type { JSX } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '@/lib/utils';

/** 与 BookshelfPageToolbar 更多菜单内单选圆点一致；内外圈始终占位，仅用透明度切换 */
export function AppRadioIndicator(props: { selected: boolean }) {
  return (
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none"
      aria-hidden
    >
      <span class="relative flex size-4 items-center justify-center">
        <span class="size-4 rounded-full border border-primary" />
        <span
          class={cn(
            'absolute size-2 rounded-full bg-primary',
            props.selected ? 'opacity-100' : 'opacity-0',
          )}
        />
      </span>
    </span>
  );
}

export type AppManualRadioOptionProps = {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  class?: string;
  children: JSX.Element;
};

export function AppManualRadioOption(props: AppManualRadioOptionProps) {
  const [local, rest] = splitProps(props, [
    'selected',
    'disabled',
    'onSelect',
    'class',
    'children',
  ]);

  return (
    <button
      type="button"
      disabled={local.disabled}
      data-selected={local.selected ? '' : undefined}
      class={cn(
        'flex min-h-9 w-full shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
        'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        local.disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent',
        local.class,
      )}
      onClick={() => {
        if (!local.disabled && !local.selected) local.onSelect();
      }}
      {...rest}
    >
      <AppRadioIndicator selected={local.selected} />
      {local.children}
    </button>
  );
}

export type AppManualRadioGroupProps = {
  class?: string;
  children: JSX.Element;
};

export function AppManualRadioGroup(props: AppManualRadioGroupProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <div class={cn('flex flex-col', local.class)} {...rest}>
      {local.children}
    </div>
  );
}

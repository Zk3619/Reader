/**
 * 基于 AppDropdownMenu 的面板浮层：用于音量、进度、倍速等非菜单项内容。
 * 与普通下拉共享入场/出场动画及互斥退场行为。
 */

import type { Component, ComponentProps, JSX } from 'solid-js';
import { splitProps } from 'solid-js';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuTrigger,
  type AppDropdownMenuProps,
} from '@/components/shared/AppDropdownMenu';
import { cn } from '@/lib/utils';

export type AppMenuPanelProps = AppDropdownMenuProps;

/** 根：等同 AppDropdownMenu（受控 open / 互斥 / 动画） */
export const AppMenuPanel: Component<AppMenuPanelProps> = (props) => (
  <AppDropdownMenu {...props} />
);

export const AppMenuPanelTrigger = AppDropdownMenuTrigger;

export type AppMenuPanelContentProps = Omit<
  ComponentProps<typeof AppDropdownMenuContent>,
  'layout'
> & {
  /**
   * 内容区内键盘不冒泡到菜单 typeahead（数字输入、快捷键等）。
   * 默认 true。
   */
  stopKeydownPropagation?: boolean;
  /** 覆盖内层内容区 class（默认 p-3 space-y-3） */
  bodyClass?: string;
  children?: JSX.Element;
};

/**
 * 面板内容：plain 布局 + 内边距；适合 Slider / Checkbox 等自定义控件。
 */
export const AppMenuPanelContent: Component<AppMenuPanelContentProps> = (props) => {
  const [local, rest] = splitProps(props, [
    'class',
    'bodyClass',
    'stopKeydownPropagation',
    'children',
  ]);
  const stopKeys = () => local.stopKeydownPropagation !== false;
  return (
    <AppDropdownMenuContent
      layout="plain"
      class={cn('min-w-0 p-0', local.class)}
      {...rest}
    >
      <div
        class={cn('space-y-3 p-3', local.bodyClass)}
        onKeyDown={stopKeys() ? (event) => event.stopPropagation() : undefined}
      >
        {local.children}
      </div>
    </AppDropdownMenuContent>
  );
};

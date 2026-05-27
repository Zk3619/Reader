/**
 * 应用内抽屉：统一关闭钮居中、侧栏拖动手柄与滚动条分区（基于 @corvu/drawer）。
 * 不修改 @/components/ui/drawer，内容区与把手布局在此封装。
 */

import type { Component, ComponentProps, JSX, ValidComponent } from 'solid-js';
import { Show, splitProps } from 'solid-js';
import type { ContentProps, DynamicProps } from '@corvu/drawer';
import DrawerPrimitive from '@corvu/drawer';

import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { XIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';

export const AppDrawer = Drawer;
export const AppDrawerTrigger = DrawerTrigger;
export const AppDrawerClose = DrawerClose;
export const AppDrawerTitle = DrawerTitle;
export const AppDrawerDescription = DrawerDescription;
export const AppDrawerFooter = DrawerFooter;

/** 与 AppDialog 关闭钮一致：icon 按钮内 flex 居中 */
export const APP_DRAWER_CLOSE_BUTTON_CLASS =
  'size-9! shrink-0 p-0! inline-flex! items-center! justify-center! rounded-md text-muted-foreground hover:bg-muted hover:text-foreground';

type AppDrawerContentProps<T extends ValidComponent = 'div'> = ContentProps<T> & {
  class?: string;
  children?: JSX.Element;
  /** 覆盖层 class，用于与内容区统一 z-index（如阅读器内段评需盖过 z-100） */
  overlayClass?: string;
};

function isSideDrawer(side: string): boolean {
  return side === 'left' || side === 'right';
}

/** 侧栏把手条：独立列，避免与内容区滚动条叠在同一侧 */
function AppDrawerSideDragStrip(props: { side: 'left' | 'right' }) {
  return (
    <div
      class="flex w-3 shrink-0 items-center justify-center self-stretch"
      aria-hidden
    >
      <div
        class={cn(
          'h-24 w-1.5 rounded-full bg-muted',
          props.side === 'left' ? 'rounded-l-sm' : 'rounded-r-sm',
        )}
      />
    </div>
  );
}

/** 底部/顶部抽屉顶栏拖动手柄（与 ui/drawer 视觉一致，仅侧栏改由 AppDrawerBody 布局） */
function AppDrawerBottomDragHandle() {
  return <div class="mx-auto mt-4 h-2 w-[100px] shrink-0 rounded-full bg-muted" />;
}

const AppDrawerContentImpl = <T extends ValidComponent = 'div'>(
  props: DynamicProps<T, AppDrawerContentProps<T>>,
) => {
  const ctx = DrawerPrimitive.useContext();
  const [, rest] = splitProps(props as AppDrawerContentProps, [
    'class',
    'children',
    'overlayClass',
  ]);
  const side = () => ctx.side();

  return (
    <DrawerPortal>
      <DrawerOverlay class={props.overlayClass} />
      <DrawerPrimitive.Content
        class={cn(
          'fixed z-50 flex flex-col border bg-background data-transitioning:transition-transform data-transitioning:duration-300 md:select-none',
          side() === 'left' &&
            'left-0 top-0 bottom-0 h-full w-full max-w-sm rounded-r-[10px] border-l',
          side() === 'right' &&
            'right-0 top-0 bottom-0 h-full w-full max-w-sm rounded-l-[10px] border-r',
          (side() === 'bottom' || side() === 'top') &&
            'inset-x-0 bottom-0 mt-24 flex h-auto flex-col rounded-t-[10px] after:absolute after:inset-x-0 after:top-full after:h-1/2 after:bg-inherit',
          props.class,
        )}
        {...rest}
      >
        <Show when={side() === 'bottom' || side() === 'top'}>
          <AppDrawerBottomDragHandle />
        </Show>
        {props.children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
};

export const AppDrawerContent: Component<AppDrawerContentProps<'div'>> =
  AppDrawerContentImpl as Component<AppDrawerContentProps<'div'>>;

export type AppDrawerHeaderProps = ComponentProps<'div'> & {
  title?: JSX.Element | string;
  /** 为 false 时不显示关闭钮 */
  showClose?: boolean;
  actions?: JSX.Element;
};

export const AppDrawerHeader: Component<AppDrawerHeaderProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'title', 'showClose', 'actions', 'children']);
  const hasRight = () => local.actions != null || local.showClose !== false;

  return (
    <DrawerHeader
      class={cn('flex shrink-0 flex-row items-center justify-between gap-2 px-4 pb-2 pt-4', local.class)}
      {...rest}
    >
      <Show
        when={local.title != null && local.title !== ''}
        fallback={<div class="min-w-0 flex-1 text-left">{local.children}</div>}
      >
        <DrawerTitle class="min-w-0 flex-1 text-left">{local.title}</DrawerTitle>
      </Show>
      <Show when={hasRight()}>
        <div class="flex shrink-0 items-center gap-1">
          {local.actions}
          <Show when={local.showClose !== false}>
            <AppDrawerCloseButton />
          </Show>
        </div>
      </Show>
    </DrawerHeader>
  );
};

/** 可滚动主体；侧栏抽屉时在右侧预留拖动手柄列 */
export const AppDrawerBody: Component<ComponentProps<'div'>> = (props) => {
  const ctx = DrawerPrimitive.useContext();
  const side = () => ctx.side();
  const [local, rest] = splitProps(props, ['class', 'children']);

  return (
    <Show
      when={isSideDrawer(side())}
      fallback={
        <div
          class={cn('flex min-h-0 flex-1 flex-col overflow-hidden', local.class)}
          data-corvu-no-drag
          {...rest}
        >
          {local.children}
        </div>
      }
    >
      <div class="flex min-h-0 flex-1 flex-row">
        <div
          class={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', local.class)}
          data-corvu-no-drag
          {...rest}
        >
          {local.children}
        </div>
        <AppDrawerSideDragStrip side={side() as 'left' | 'right'} />
      </div>
    </Show>
  );
};

export const AppDrawerCloseButton: Component<{
  class?: string;
  disabled?: boolean;
  /** 非 Drawer 场景（如嵌入式段评面板） */
  onClick?: () => void;
  'aria-label'?: string;
}> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'disabled', 'onClick', 'aria-label']);

  if (local.onClick) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class={cn(APP_DRAWER_CLOSE_BUTTON_CLASS, local.class)}
        disabled={local.disabled}
        onClick={local.onClick}
        aria-label={local['aria-label'] ?? '关闭'}
        {...rest}
      >
        <XIcon class="h-4 w-4" size={16} />
        <span class="sr-only">关闭</span>
      </Button>
    );
  }

  return (
    <DrawerClose
      as={Button}
      variant="ghost"
      size="icon"
      class={cn(APP_DRAWER_CLOSE_BUTTON_CLASS, local.class)}
      disabled={local.disabled}
      aria-label={local['aria-label'] ?? '关闭'}
      {...rest}
    >
      <XIcon class="h-4 w-4" size={16} />
      <span class="sr-only">关闭</span>
    </DrawerClose>
  );
};

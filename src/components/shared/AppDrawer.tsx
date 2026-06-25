/**
 * 应用内抽屉：统一关闭钮居中、侧栏拖动手柄与滚动条分区（基于 @corvu/drawer）。
 * 不修改 @/components/ui/drawer，内容区与把手布局在此封装。
 */

import type { Component, ComponentProps, JSX, ValidComponent } from 'solid-js';
import {
  createContext,
  createMemo,
  createSignal,
  Show,
  splitProps,
  useContext,
  type Accessor,
} from 'solid-js';
import type { ContentProps, DynamicProps } from '@corvu/drawer';
import DrawerPrimitive from '@corvu/drawer';

import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { XIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import {
  AppDrawerOverlayLockContext,
  AppDrawerPortalMountContext,
  appDrawerBlocksOutsideDismiss,
  preventCorvuOutsidePointerForAppToast,
  preventDrawerDismissForFloatingOverlay,
  type AppDrawerOverlayLock,
} from '@/components/shared/app-drawer-overlay-lock';
import {
  appBlockDrag,
  appDrawerBottomSafeArea,
  appDrawerSideSafeArea,
  appDrawerTopSafeArea,
} from '@/lib/ui/viewport-classes';
import { overlayLayerZ } from '@/lib/ui/overlay-layer-active';
import { APP_OVERLAY_BACKDROP_CLASS } from '@/lib/ui/overlay-z';
import { scheduleOverlayPositionSync } from '@/lib/ui/overlay-position-sync';

export type { AppDrawerOverlayLock } from '@/components/shared/app-drawer-overlay-lock';
export {
  AppDrawerOverlayLockContext,
  AppDrawerPortalMountContext,
  useAppDrawerOverlayLock,
  useAppDrawerPortalMount,
} from '@/components/shared/app-drawer-overlay-lock';

export type AppDrawerProps = ComponentProps<typeof Drawer>;

/** 根节点：抽屉内 Portal 浮层（Select 等）打开时暂停 closeOnOutsidePointer */
export const AppDrawer: Component<AppDrawerProps> = (props) => {
  const [local, rest] = splitProps(props, [
    'closeOnOutsidePointer',
    'closeOnOutsideFocus',
    'children',
    'onOutsidePointer',
    'onOpenChange',
  ]);
  const [overlayLockCount, setOverlayLockCount] = createSignal(0);

  const overlayLock: AppDrawerOverlayLock = {
    acquire: () => {
      setOverlayLockCount((c) => c + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        setOverlayLockCount((c) => Math.max(0, c - 1));
      };
    },
  };

  return (
    <AppDrawerOverlayLockContext.Provider value={overlayLock}>
      <Drawer
        {...rest}
        closeOnOutsidePointer={appDrawerBlocksOutsideDismiss(
          overlayLockCount,
          local.closeOnOutsidePointer,
        )}
        closeOnOutsideFocus={local.closeOnOutsideFocus ?? false}
        onOpenChange={(open) => {
          if (open) scheduleOverlayPositionSync();
          local.onOpenChange?.(open);
        }}
        onOutsidePointer={(event) => {
          preventCorvuOutsidePointerForAppToast(event);
          preventDrawerDismissForFloatingOverlay(event);
          local.onOutsidePointer?.(event);
        }}
      >
        {local.children}
      </Drawer>
    </AppDrawerOverlayLockContext.Provider>
  );
};
export const AppDrawerTrigger = DrawerTrigger;
export const AppDrawerClose = DrawerClose;
export const AppDrawerTitle = DrawerTitle;
export const AppDrawerDescription = DrawerDescription;
export const AppDrawerFooter = DrawerFooter;

/** 与 AppDialog 关闭钮一致：icon 按钮内 flex 居中 */
export const APP_DRAWER_CLOSE_BUTTON_CLASS =
  'size-9! shrink-0 p-0! inline-flex! items-center! justify-center! rounded-md text-muted-foreground hover:bg-muted hover:text-foreground';

const AppDrawerNativeDragHandleContext = createContext<() => boolean>(() => false);

/** 顶/底抽屉内容区默认最大高度（侧栏抽屉占满高度，不限制） */
const APP_DRAWER_MAX_HEIGHT_CLASS = 'max-h-[80dvh]';

type AppDrawerContentProps<T extends ValidComponent = 'div'> = ContentProps<T> & {
  class?: string;
  children?: JSX.Element;
  /** 覆盖层 class，用于与内容区统一 z-index（如阅读器内段评需盖过 z-100） */
  overlayClass?: string;
  /** 是否显示顶/底栏或侧栏的原生拖动手柄条，默认 false */
  showNativeDragHandle?: boolean;
  /** App 根级抽屉（如书籍详情）须挂 body 并使用自带 z-index，勿挂阅读器 Portal 宿主 */
  portalToBody?: boolean;
};

export type AppDrawerBodyProps = ComponentProps<'div'> & {
  /** 覆盖 Content 上的 showNativeDragHandle；未传则继承 Content */
  showNativeDragHandle?: boolean;
  /**
   * 为 true 时 body 不参与抽屉拖拽关闭（等同 data-corvu-no-drag）。
   * 侧栏且 showNativeDragHandle 时内容区默认 true（拖拽由边缘把手承担）。
   */
  disableDragClose?: boolean;
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

/** 主题色遮罩 + 分层 z-index（高于 Corvu 默认纯黑 rgb 遮罩） */
function AppDrawerOverlay(props: { class?: string }) {
  const ctx = DrawerPrimitive.useContext();
  const [local] = splitProps(props, ['class']);
  return (
    <DrawerPrimitive.Overlay
      data-app-overlay-backdrop=""
      class={cn(
        'fixed inset-0',
        APP_OVERLAY_BACKDROP_CLASS,
        'data-transitioning:transition-opacity data-transitioning:duration-300',
        overlayLayerZ().drawerOverlay,
        appBlockDrag,
        local.class,
      )}
      style={{
        opacity: `${0.8 * ctx.openPercentage()}`,
      }}
    />
  );
}

const AppDrawerPortalMountHost: Component<{ children: JSX.Element }> = (props) => {
  const [portalMount, setPortalMount] = createSignal<HTMLElement | undefined>();
  const mountAccessor: Accessor<HTMLElement | undefined> = portalMount;

  return (
    <AppDrawerPortalMountContext.Provider value={mountAccessor}>
      <div ref={setPortalMount} class="flex min-h-0 min-w-0 flex-1 flex-col overflow-visible">
        {props.children}
      </div>
    </AppDrawerPortalMountContext.Provider>
  );
};

const AppDrawerContentImpl = <T extends ValidComponent = 'div'>(
  props: DynamicProps<T, AppDrawerContentProps<T>>,
) => {
  const ctx = DrawerPrimitive.useContext();
  const [local, rest] = splitProps(props as AppDrawerContentProps, [
    'class',
    'children',
    'overlayClass',
    'showNativeDragHandle',
    'portalToBody',
  ]);
  const side = () => ctx.side();
  const showNativeDragHandle = createMemo(() => local.showNativeDragHandle ?? false);

  return (
    <AppDrawerNativeDragHandleContext.Provider value={showNativeDragHandle}>
      <DrawerPortal>
        <AppDrawerOverlay class={local.overlayClass} />
        <DrawerPrimitive.Content
          data-app-overlay-surface=""
          class={cn(
            'fixed flex flex-col border bg-background data-transitioning:transition-transform data-transitioning:duration-300 md:select-none',
            overlayLayerZ().drawer,
            appBlockDrag,
            (side() === 'bottom' || side() === 'top') && APP_DRAWER_MAX_HEIGHT_CLASS,
            side() === 'left' &&
              cn(
                'left-0 top-0 bottom-0 h-full w-full max-w-sm rounded-r-[10px] border-l',
                appDrawerSideSafeArea,
              ),
            side() === 'right' &&
              cn(
                'right-0 top-0 bottom-0 h-full w-full max-w-sm rounded-l-[10px] border-r',
                appDrawerSideSafeArea,
              ),
            side() === 'bottom' &&
              cn(
                'inset-x-0 bottom-0 mt-24 flex h-auto flex-col rounded-t-[10px] after:absolute after:inset-x-0 after:top-full after:h-1/2 after:bg-inherit',
                appDrawerBottomSafeArea,
              ),
            side() === 'top' &&
              cn(
                'inset-x-0 top-0 flex h-auto flex-col rounded-b-[10px]',
                appDrawerTopSafeArea,
              ),
            local.class,
          )}
          {...rest}
        >
          <Show when={showNativeDragHandle() && (side() === 'bottom' || side() === 'top')}>
            <AppDrawerBottomDragHandle />
          </Show>
          <AppDrawerPortalMountHost>{local.children}</AppDrawerPortalMountHost>
        </DrawerPrimitive.Content>
      </DrawerPortal>
    </AppDrawerNativeDragHandleContext.Provider>
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

/** 侧栏抽屉标题：flex 子项需 min-w-0 + truncate 才能在窄宽下省略 */
const APP_DRAWER_HEADER_TITLE_CLASS = 'min-w-0 flex-1 truncate text-left';

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
        fallback={<div class={APP_DRAWER_HEADER_TITLE_CLASS}>{local.children}</div>}
      >
        <DrawerTitle class={APP_DRAWER_HEADER_TITLE_CLASS}>{local.title}</DrawerTitle>
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

/**
 * 可滚动主体；侧栏且 showNativeDragHandle 时在边缘预留拖动手柄列。
 * 默认可参与抽屉拖拽关闭；整页滚动等场景传 disableDragClose，或在内部滚动区单独标记。
 */
export const AppDrawerBody: Component<AppDrawerBodyProps> = (props) => {
  const ctx = DrawerPrimitive.useContext();
  const inheritedShowDragHandle = useContext(AppDrawerNativeDragHandleContext);
  const side = () => ctx.side();
  const [local, rest] = splitProps(props, [
    'class',
    'children',
    'showNativeDragHandle',
    'disableDragClose',
  ]);
  const showNativeDragHandle = createMemo(
    () => local.showNativeDragHandle ?? inheritedShowDragHandle(),
  );
  const disableDragClose = createMemo(
    () =>
      local.disableDragClose ??
      (isSideDrawer(side()) && showNativeDragHandle()),
  );
  const noDragProps = () =>
    disableDragClose() ? ({ 'data-corvu-no-drag': '' } as const) : {};

  const bodyClass = cn('flex min-h-0 flex-1 flex-col overflow-hidden', local.class);

  return (
    <Show
      when={isSideDrawer(side()) && showNativeDragHandle()}
      fallback={
        <div class={bodyClass} {...noDragProps()} {...rest}>
          {local.children}
        </div>
      }
    >
      <div class="flex min-h-0 flex-1 flex-row">
        <div class={cn(bodyClass, 'min-w-0')} {...noDragProps()} {...rest}>
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

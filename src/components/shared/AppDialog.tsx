/**
 * 应用内对话框框架：统一根节点打开/关闭时的无障碍处理，以及常用内容区布局。
 * 底层仍使用 @/components/ui/dialog（Kobalte Dialog 原语）。
 */

import type { Component, ComponentProps, JSX, ValidComponent } from 'solid-js';
import { Show, on, splitProps } from 'solid-js';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import * as DialogPrimitive from '@kobalte/core/dialog';

import {
  Dialog,
  DialogFooter,
  DialogOverlay,
  DialogTitle,
  DialogDescription,
  dialogContentMotionClass,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { XIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { overlayLayerZ } from '@/lib/ui/overlay-layer-active';
import { useOverlayPortalMountAccessor } from '@/lib/ui/overlay-portal-mount';
import { appBlockDrag, dialogContentInPortal, dialogPortalShell, dialogViewportMaxBounds, dialogViewportMinBounds } from '@/lib/ui/viewport-classes';
import { scheduleOverlayPositionSync } from '@/lib/ui/overlay-position-sync';
import { preventOverlayDismissForAppToast } from '@/components/shared/app-drawer-overlay-lock';
import {
  clearFocusBeforeModal,
  prepareForAppDialogOpen,
  releasePageFocus,
} from '@/utils/accessibility';
import { restoreAppModalSideEffects } from '@/lib/ui/overlay-cleanup';

/** 与 WindowControlButtons 关闭钮一致（ghost + destructive hover） */
export const APP_DIALOG_CLOSE_BUTTON_CLASS =
  'h-9 w-9 shrink-0 rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors';

const APP_DIALOG_CONTENT_IN_PORTAL_CLASS = dialogContentInPortal;

const APP_DIALOG_CONTENT_SURFACE_CLASS =
  'border bg-background shadow-lg rounded-lg';

type AppDialogPortalProps = DialogPrimitive.DialogPortalProps & {
  wrapperClass?: string;
  /** 与 BookInfoDrawer 一致：挂 body 并用显式 z-index（阅读器内请用 ViewerAppDialogContent） */
  portalToBody?: boolean;
};

const AppDialogPortal: Component<AppDialogPortalProps> = (props) => {
  const [local, rest] = splitProps(props, ['children', 'wrapperClass', 'portalToBody']);
  const viewerPortalHost = useOverlayPortalMountAccessor();
  const resolveMount = () => {
    // portalToBody：显式挂 body，由 portalZClass / overlay 档位决定 z-index（须高于 BookInfoDrawer z-120 等）
    if (local.portalToBody) return document.body;
    const viewerHost = viewerPortalHost();
    if (viewerHost) return viewerHost;
    return document.body;
  };
  return (
    <DialogPrimitive.Portal mount={resolveMount()} {...rest}>
      <div
        class={cn(
          'pointer-events-none fixed inset-0 overflow-hidden',
          dialogPortalShell,
          local.wrapperClass,
        )}
      >
        {local.children}
      </div>
    </DialogPrimitive.Portal>
  );
};

/** 与 ui/dialog 中 DialogContent 一致的扩展 props（含 layout） */
export type AppDialogContentProps<T extends ValidComponent = 'div'> =
  DialogPrimitive.DialogContentProps<T> & {
    class?: string | undefined;
    children?: JSX.Element;
    portalZClass?: string | undefined;
    overlayClass?: string | undefined;
    /**
     * app：视口 min/max + w-max/h-fit 自适应 + flex 纵向堆叠 + p-0
     * plain：不附加默认尺寸类，用于内嵌页 Cookie 等简单对话框
     */
    layout?: 'app' | 'plain';
    /** 挂 body + 显式 portalZClass/overlayClass（阅读器叠层内用 ViewerAppDialogContent） */
    portalToBody?: boolean;
  };

export type AppDialogProps = ComponentProps<typeof Dialog> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: JSX.Element;
  /**
   * 为 true 时不注入打开/关闭时的 blur 与 triggerDialogOpened（少数场景需与内嵌页手势协调时使用）
   */
  disableAccessibilityAnnounce?: boolean;
};

export const AppDialog: Component<AppDialogProps> = (props) => {
  const [local, rest] = splitProps(props, [
    'open',
    'onOpenChange',
    'children',
    'disableAccessibilityAnnounce',
  ]);

  on(
    () => local.open,
    (open) => {
      if (local.disableAccessibilityAnnounce || !open) return;
      scheduleOverlayPositionSync();
      releasePageFocus();
      prepareForAppDialogOpen();
      requestAnimationFrame(() => releasePageFocus());
    },
    { defer: false }
  );

  const handleOpenChange = (open: boolean) => {
    if (!local.disableAccessibilityAnnounce && !open) {
      clearFocusBeforeModal();
      restoreAppModalSideEffects();
      // 关闭动画结束后再次清理，避免残留遮罩挡住抽屉遮罩点击
      window.setTimeout(() => restoreAppModalSideEffects(), 220);
    }
    local.onOpenChange(open);
  };

  return (
    <Dialog open={local.open} onOpenChange={handleOpenChange} {...rest}>
      {local.children}
    </Dialog>
  );
};

const AppDialogContentImpl = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, AppDialogContentProps<T>>
) => {
  const [, rest] = splitProps(props as AppDialogContentProps<T>, [
    'class',
    'children',
    'portalZClass',
    'overlayClass',
    'layout',
    'portalToBody',
    'onOpenAutoFocus',
    'onPointerDownOutside',
    'onInteractOutside',
  ]);
  const userOnOpenAutoFocus = () => (props as AppDialogContentProps<T>).onOpenAutoFocus;
  const userOnPointerDownOutside = () =>
    (props as AppDialogContentProps<T>).onPointerDownOutside;
  const userOnInteractOutside = () => (props as AppDialogContentProps<T>).onInteractOutside;
  const layout = () => (props as AppDialogContentProps<T>).layout ?? 'app';
  const portalToBody = () => (props as AppDialogContentProps<T>).portalToBody === true;
  const userClass = () => (props as AppDialogContentProps<T>).class;
  const zOverride = () => (props as AppDialogContentProps<T>).portalZClass;
  const overlayCls = () => (props as AppDialogContentProps<T>).overlayClass;
  const portalZ = () => zOverride() ?? overlayLayerZ().dialogOverlay;
  const overlayZ = () => overlayCls() ?? zOverride() ?? overlayLayerZ().dialogOverlay;
  const contentZ = () => zOverride() ?? overlayLayerZ().dialog;
  return (
    <AppDialogPortal wrapperClass={portalZ()} portalToBody={portalToBody()}>
      <DialogOverlay
        data-app-overlay-backdrop=""
        class={cn('pointer-events-auto', overlayZ(), appBlockDrag, overlayCls())}
      />
      <DialogPrimitive.Content
        data-app-overlay-surface=""
        {...(rest as DialogPrimitive.DialogContentProps<'div'>)}
        onOpenAutoFocus={(e) => {
          userOnOpenAutoFocus()?.(e);
          if (e.defaultPrevented) return;
          e.preventDefault();
          releasePageFocus();
          const dialog = e.currentTarget as HTMLElement | undefined;
          dialog?.focus({ preventScroll: true });
        }}
        onPointerDownOutside={(e) => {
          preventOverlayDismissForAppToast(e);
          userOnPointerDownOutside()?.(e);
        }}
        onInteractOutside={(e) => {
          preventOverlayDismissForAppToast(e);
          userOnInteractOutside()?.(e);
        }}
        class={cn(
          APP_DIALOG_CONTENT_IN_PORTAL_CLASS,
          APP_DIALOG_CONTENT_SURFACE_CLASS,
          dialogContentMotionClass,
          appBlockDrag,
          'pointer-events-auto',
          contentZ(),
          layout() === 'app' && 'flex min-h-0 max-h-full flex-col overflow-hidden p-0',
          layout() === 'plain' &&
            'grid min-h-0 max-h-full w-full max-w-lg gap-4 overflow-y-auto p-6',
          dialogViewportMaxBounds,
          userClass(),
          dialogViewportMinBounds,
        )}
      >
        {(props as AppDialogContentProps<T>).children}
      </DialogPrimitive.Content>
    </AppDialogPortal>
  );
};

/** 断言为 DialogContent 会丢失 `layout` 等扩展字段的类型，故使用显式 props */
export const AppDialogContent: Component<AppDialogContentProps<'div'>> =
  AppDialogContentImpl as Component<AppDialogContentProps<'div'>>;

export const AppDialogCloseButton: Component<{
  class?: string;
  disabled?: boolean;
}> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'disabled']);
  return (
    <AppTooltip>
      <AppTooltipTrigger
        onFocus={(e) => e.preventDefault()}
        as={(triggerProps: Record<string, unknown>) => (
          <DialogPrimitive.CloseButton
            as={Button}
            variant="ghost"
            size="icon"
            class={cn(APP_DIALOG_CLOSE_BUTTON_CLASS, local.class)}
            disabled={local.disabled}
            {...triggerProps}
            {...rest}
          >
            <XIcon class="h-4 w-4" size={16} />
            <span class="sr-only">关闭</span>
          </DialogPrimitive.CloseButton>
        )}
      />
      <AppTooltipContent>关闭</AppTooltipContent>
    </AppTooltip>
  );
};

export type AppDialogHeaderProps = ComponentProps<'div'> & {
  /** 为 false 时不显示头部关闭钮 */
  showClose?: boolean;
  /** 头部右侧操作区（关闭钮左侧，宽度随内容） */
  actions?: JSX.Element;
};

export const AppDialogHeader: Component<AppDialogHeaderProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'showClose', 'actions', 'children']);
  const hasRight = () => local.actions != null || local.showClose !== false;
  return (
    <div
      class={cn('shrink-0 flex items-center justify-between gap-x-3 px-6 pt-6', local.class)}
      {...rest}
    >
      <div class="min-w-0 w-auto max-w-full flex-1 flex flex-col text-left [&>*:not(:first-child):not(.sr-only)]:mt-1.5">
        {local.children}
      </div>
      <Show when={hasRight()}>
        <div class="shrink-0 flex items-center gap-2">
          {local.actions}
          <Show when={local.showClose !== false}>
            <AppDialogCloseButton />
          </Show>
        </div>
      </Show>
    </div>
  );
};

export const AppDialogFooter: Component<ComponentProps<'div'>> = (props) => {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <DialogFooter
      class={cn(
        'shrink-0 flex-row justify-end gap-2 border-t border-border/50 bg-background px-6 py-4',
        local.class
      )}
      {...rest}
    />
  );
};

export { DialogTitle as AppDialogTitle, DialogDescription as AppDialogDescription };

/** 弹窗正文可滚动区（外框固定留白 + 内轨滚动） */
export { DialogScrollViewport as AppDialogScrollBody } from '@/components/shared/DialogScrollViewport';

/** 与 AppDialog 配套的触发器，仍来自 Kobalte Dialog 原语 */
export { DialogTrigger } from '@/components/ui/dialog';

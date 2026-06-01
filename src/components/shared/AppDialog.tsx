/**
 * 应用内对话框框架：统一根节点打开/关闭时的无障碍处理，以及常用内容区布局。
 * 底层仍使用 @/components/ui/dialog（Kobalte Dialog 原语）。
 */

import type { Component, ComponentProps, JSX, ValidComponent } from 'solid-js';
import { Show, on, splitProps } from 'solid-js';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import * as DialogPrimitive from '@kobalte/core/dialog';

import { Dialog, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { XIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { appBlockDrag, dialogViewportLimits } from '@/lib/ui/viewport-classes';
import { preventOverlayDismissForAppToast } from '@/components/shared/app-drawer-overlay-lock';
import {
  clearFocusBeforeModal,
  prepareForAppDialogOpen,
  releasePageFocus,
} from '@/utils/accessibility';

/** 与 WindowControlButtons 关闭钮一致（ghost + destructive hover） */
export const APP_DIALOG_CLOSE_BUTTON_CLASS =
  'h-9 w-9 shrink-0 rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors';

/** 与 ui/dialog DialogContent 对齐，但不渲染右上角默认关闭钮 */
const APP_DIALOG_CONTENT_BASE_CLASS =
  'fixed left-1/2 top-1/2 z-50 grid max-h-screen w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto border bg-background p-6 shadow-lg duration-200 data-expanded:animate-in data-closed:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 data-[closed]:slide-out-to-left-1/2 data-[closed]:slide-out-to-top-[48%] data-[expanded]:slide-in-from-left-1/2 data-[expanded]:slide-in-from-top-[48%] rounded-lg';

type AppDialogPortalProps = DialogPrimitive.DialogPortalProps & { wrapperClass?: string };

const AppDialogPortal: Component<AppDialogPortalProps> = (props) => {
  const [, rest] = splitProps(props, ['children', 'wrapperClass']);
  return (
    <DialogPrimitive.Portal {...rest}>
      <div
        class={cn(
          'fixed inset-0 z-50 flex items-start justify-center sm:items-center',
          props.wrapperClass
        )}
      >
        {props.children}
      </div>
    </DialogPrimitive.Portal>
  );
};

const AppDialogOverlay: Component<{ class?: string }> = (props) => (
  <DialogPrimitive.Overlay
    class={cn(
      'fixed inset-0 z-50 bg-background/80 data-expanded:animate-in data-closed:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0',
      appBlockDrag,
      props.class
    )}
  />
);

/** 与 ui/dialog 中 DialogContent 一致的扩展 props（含 layout） */
export type AppDialogContentProps<T extends ValidComponent = 'div'> =
  DialogPrimitive.DialogContentProps<T> & {
    class?: string | undefined;
    children?: JSX.Element;
    portalZClass?: string | undefined;
    overlayClass?: string | undefined;
    /**
     * app：视口限制 + flex 纵向堆叠 + p-0（与 BookshelfLayoutDialog 等一致）
     * plain：不附加默认尺寸类，用于内嵌页 Cookie 等简单对话框
     */
    layout?: 'app' | 'plain';
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
      releasePageFocus();
      prepareForAppDialogOpen();
      requestAnimationFrame(() => releasePageFocus());
    },
    { defer: false }
  );

  const handleOpenChange = (open: boolean) => {
    if (!local.disableAccessibilityAnnounce && !open) {
      clearFocusBeforeModal();
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
    'onOpenAutoFocus',
    'onPointerDownOutside',
    'onInteractOutside',
  ]);
  const userOnOpenAutoFocus = () => (props as AppDialogContentProps<T>).onOpenAutoFocus;
  const userOnPointerDownOutside = () =>
    (props as AppDialogContentProps<T>).onPointerDownOutside;
  const userOnInteractOutside = () => (props as AppDialogContentProps<T>).onInteractOutside;
  const layout = () => (props as AppDialogContentProps<T>).layout ?? 'app';
  const portalZ = () => (props as AppDialogContentProps<T>).portalZClass;
  const overlayCls = () => (props as AppDialogContentProps<T>).overlayClass;
  return (
    <AppDialogPortal wrapperClass={portalZ()}>
      <AppDialogOverlay class={cn(portalZ(), overlayCls())} />
      <DialogPrimitive.Content
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
          APP_DIALOG_CONTENT_BASE_CLASS,
          appBlockDrag,
          portalZ(),
          layout() === 'app' && `${dialogViewportLimits} flex flex-col overflow-hidden p-0`,
          (props as AppDialogContentProps<T>).class
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
    <Tooltip>
      <TooltipTrigger
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
      <TooltipContent class="z-100">关闭</TooltipContent>
    </Tooltip>
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

/** 与 AppDialog 配套的触发器，仍来自 Kobalte Dialog 原语 */
export { DialogTrigger } from '@/components/ui/dialog';

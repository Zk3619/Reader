/**
 * 阅读器导航叠层内的浮层封装（与 BookInfoDrawer 相同策略）：
 * - Portal 挂 document.body（portalToBody）
 * - 显式使用 MEDIA_VIEWER_OVERLAY_LAYER_Z，高于阅读器壳层 z-[110]
 *
 * 保留 overlay 栈以支持浏览器后退 / 系统返回；勿使用 #reader-overlay-portal-host。
 */

import type { Component, ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '@/lib/utils';
import { MEDIA_VIEWER_OVERLAY_LAYER_Z } from '@/lib/ui/overlay-z';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerClose,
  AppDrawerCloseButton,
  AppDrawerContent,
  AppDrawerDescription,
  AppDrawerFooter,
  AppDrawerHeader,
  AppDrawerTitle,
  AppDrawerTrigger,
  type AppDrawerProps,
} from '@/components/shared/AppDrawer';
import {
  AppDialog,
  AppDialogCloseButton,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  type AppDialogContentProps,
  type AppDialogProps,
} from '@/components/shared/AppDialog';
import { AppDropdownMenuContent } from '@/components/shared/AppDropdownMenu';
import { AppSelectContent } from '@/components/shared/AppSelect';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';

/** 阅读器内 Dialog / Drawer / Popper 的 z-index 档位（与 overlay-z 同步） */
export const VIEWER_OVERLAY_Z = MEDIA_VIEWER_OVERLAY_LAYER_Z;

export type ViewerAppDrawerContentProps = Omit<
  ComponentProps<typeof AppDrawerContent>,
  'portalToBody'
>;

export const ViewerAppDrawerContent: Component<ViewerAppDrawerContentProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'overlayClass']);
  return (
    <AppDrawerContent
      portalToBody
      overlayClass={cn(VIEWER_OVERLAY_Z.drawerOverlay, local.overlayClass)}
      class={cn(VIEWER_OVERLAY_Z.drawer, local.class)}
      {...rest}
    />
  );
};

export type ViewerAppDialogContentProps = Omit<AppDialogContentProps, 'portalToBody'>;

export const ViewerAppDialogContent: Component<ViewerAppDialogContentProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'overlayClass', 'portalZClass']);
  const overlayZ = () => local.portalZClass ?? VIEWER_OVERLAY_Z.dialogOverlay;
  return (
    <AppDialogContent
      portalToBody
      portalZClass={overlayZ()}
      overlayClass={cn(overlayZ(), local.overlayClass)}
      class={cn(VIEWER_OVERLAY_Z.dialog, local.class)}
      {...rest}
    />
  );
};

export type ViewerAppDropdownMenuContentProps = Omit<
  ComponentProps<typeof AppDropdownMenuContent>,
  'portalToBody'
>;

export const ViewerAppDropdownMenuContent: Component<ViewerAppDropdownMenuContentProps> = (
  props,
) => {
  const [local, rest] = splitProps(props, ['class', 'portalZClass']);
  const popperZ = () => local.portalZClass ?? VIEWER_OVERLAY_Z.popper;
  return (
    <AppDropdownMenuContent
      portalToBody
      portalZClass={popperZ()}
      class={cn(popperZ(), local.class)}
      {...rest}
    />
  );
};

export type ViewerAppSelectContentProps = Omit<
  ComponentProps<typeof AppSelectContent>,
  'portalToBody'
>;

export const ViewerAppSelectContent: Component<ViewerAppSelectContentProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'portalZClass']);
  const popperZ = () => local.portalZClass ?? VIEWER_OVERLAY_Z.popper;
  return (
    <AppSelectContent
      portalToBody
      portalZClass={popperZ()}
      class={cn(popperZ(), local.class)}
      {...rest}
    />
  );
};

export type ViewerAppTooltipContentProps = Omit<
  ComponentProps<typeof AppTooltipContent>,
  'portalToBody'
>;

export const ViewerAppTooltipContent: Component<ViewerAppTooltipContentProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'portalZClass']);
  const popperZ = () => local.portalZClass ?? VIEWER_OVERLAY_Z.popper;
  return (
    <AppTooltipContent
      portalToBody
      portalZClass={popperZ()}
      class={cn(popperZ(), local.class)}
      {...rest}
    />
  );
};

export {
  AppDrawer as ViewerAppDrawer,
  type AppDrawerProps as ViewerAppDrawerProps,
  AppDrawerBody as ViewerAppDrawerBody,
  AppDrawerClose as ViewerAppDrawerClose,
  AppDrawerCloseButton as ViewerAppDrawerCloseButton,
  AppDrawerDescription as ViewerAppDrawerDescription,
  AppDrawerFooter as ViewerAppDrawerFooter,
  AppDrawerHeader as ViewerAppDrawerHeader,
  AppDrawerTitle as ViewerAppDrawerTitle,
  AppDrawerTrigger as ViewerAppDrawerTrigger,
  AppDialog as ViewerAppDialog,
  type AppDialogProps as ViewerAppDialogProps,
  AppDialogCloseButton as ViewerAppDialogCloseButton,
  AppDialogDescription as ViewerAppDialogDescription,
  AppDialogFooter as ViewerAppDialogFooter,
  AppDialogHeader as ViewerAppDialogHeader,
  AppDialogTitle as ViewerAppDialogTitle,
  AppTooltip as ViewerAppTooltip,
  AppTooltipTrigger as ViewerAppTooltipTrigger,
};

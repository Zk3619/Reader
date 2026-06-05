/**
 * 书籍详情抽屉内浮层：Portal 挂 body，z-index 高于 BookInfoDrawer（z-[120]）。
 */

import type { Component } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '@/lib/utils';
import {
  AppDialogContent,
  type AppDialogContentProps,
} from '@/components/shared/AppDialog';
import {
  APP_BOOK_INFO_DIALOG_OVERLAY_Z,
  APP_BOOK_INFO_DIALOG_Z,
} from '@/lib/ui/overlay-z';

export type BookInfoDrawerDialogContentProps = Omit<AppDialogContentProps, 'portalToBody'>;

export const BookInfoDrawerDialogContent: Component<BookInfoDrawerDialogContentProps> = (
  props,
) => {
  const [local, rest] = splitProps(props, ['class', 'overlayClass', 'portalZClass']);
  const overlayZ = () => local.portalZClass ?? APP_BOOK_INFO_DIALOG_OVERLAY_Z;
  return (
    <AppDialogContent
      portalToBody
      portalZClass={overlayZ()}
      overlayClass={cn(overlayZ(), local.overlayClass)}
      class={cn(APP_BOOK_INFO_DIALOG_Z, local.class)}
      {...rest}
    />
  );
};

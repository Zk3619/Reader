/**
 * Inner-Web 四向抽屉壳：对齐阅读设置抽屉用法（如阅读设置），避免 flushToEdge / 内联 height corvu 动画冲突
 */

import { type JSX, createContext, createEffect, createSignal, onCleanup, onMount, useContext, type Accessor } from 'solid-js';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerContent,
} from '@/components/shared/AppDrawer';
import {
  INNER_WEB_DRAWER_TRANSITION_MS,
  completeInnerWebDrawerDismiss,
  setInnerWebDrawerAnimatedDismiss,
} from '@/lib/platform/inner-web';
import {
  innerWebDrawerHeightClass,
  innerWebDrawerPanelStyle,
  isHorizontalDrawerSide,
  resolveInnerWebPresentation,
  type ResolvedInnerWebPresentation,
} from '@/lib/platform/inner-web-presentation';
import { cn } from '@/lib/utils';

/** 抽屉正在播放关闭动画（iframe / Tauri 子 WebView 不参与 corvu transform，须提前隐藏） */
const InnerWebDrawerClosingContext = createContext<Accessor<boolean>>(() => false);

export function useInnerWebDrawerClosing(): Accessor<boolean> {
  return useContext(InnerWebDrawerClosingContext);
}

export interface InnerWebDrawerShellProps {
  /** 宿主层：payload 已就绪且 layout 为 drawer */
  open: boolean;
  resolved: ResolvedInnerWebPresentation;
  children: JSX.Element;
}

export function InnerWebDrawerShell(props: InnerWebDrawerShellProps) {
  /** 关闭动画期间 props.open 仍为 true，由本地 open 驱动 corvu */
  const [open, setOpen] = createSignal(false);
  const [closing, setClosing] = createSignal(false);
  const drawer = () => props.resolved.drawer;
  const side = () => drawer().side;
  const snapPoints = () => (drawer().dragToDismiss ? ([0, 1] as const) : ([1] as const));

  let dismissTimer: ReturnType<typeof setTimeout> | undefined;

  const finishDismiss = () => {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = undefined;
    }
    completeInnerWebDrawerDismiss();
  };

  const animateDismiss = () => {
    if (!open()) {
      // 尚未打开 corvu 可能误发 close；仅当宿主已结束会话才清空
      if (!props.open) finishDismiss();
      return;
    }
    setClosing(true);
    setOpen(false);
    dismissTimer = setTimeout(() => finishDismiss(), INNER_WEB_DRAWER_TRANSITION_MS);
  };

  onMount(() => {
    setInnerWebDrawerAnimatedDismiss(animateDismiss);
  });

  onCleanup(() => {
    if (dismissTimer) clearTimeout(dismissTimer);
    setInnerWebDrawerAnimatedDismiss(null);
  });

  createEffect(() => {
    if (props.open) {
      setClosing(false);
      setInnerWebDrawerAnimatedDismiss(animateDismiss);
      if (!dismissTimer) setOpen(true);
    } else if (!dismissTimer) {
      setOpen(false);
    }
  });

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setOpen(true);
      return;
    }
    // 首帧 open=false 时忽发 corvu spurious close，避免立即 finishDismiss 清空 payload
    if (!open()) return;
    animateDismiss();
  };

  const overlayClass = () =>
    cn(
      'z-[150]',
      props.resolved.backdrop.class,
      !props.resolved.backdrop.visible && 'opacity-0 pointer-events-none',
      props.resolved.backdrop.blur && 'backdrop-blur-sm',
    );

  const contentClass = () =>
    cn(
      'z-[151] flex flex-col',
      isHorizontalDrawerSide(side())
        ? 'h-full max-w-none'
        : cn(innerWebDrawerHeightClass(drawer()), 'max-h-[92dvh]'),
      props.resolved.panelClass,
      side() === 'left' && 'rounded-r-2xl',
      side() === 'right' && 'rounded-l-2xl',
      side() === 'bottom' && 'border-x-0 border-b-0',
      side() === 'top' && 'rounded-b-2xl border-x-0 border-t-0',
    );

  const panelStyle = () => {
    if (!isHorizontalDrawerSide(side())) return undefined;
    return innerWebDrawerPanelStyle(drawer());
  };

  return (
    <AppDrawer
      open={open()}
      onOpenChange={handleOpenChange}
      side={side()}
      snapPoints={[...snapPoints()]}
      defaultSnapPoint={1}
      closeOnOutsidePointer={props.resolved.backdrop.dismissOnClick}
      closeOnOutsideFocus={false}
    >
      <AppDrawerContent
        class={contentClass()}
        overlayClass={overlayClass()}
        showNativeDragHandle={false}
        style={panelStyle()}
      >
        <AppDrawerBody class="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <InnerWebDrawerClosingContext.Provider value={closing}>
            {props.children}
          </InnerWebDrawerClosingContext.Provider>
        </AppDrawerBody>
      </AppDrawerContent>
    </AppDrawer>
  );
}

/** 空闲时占位 resolved，保证 corvu 实例常驻、配置稳定（对齐阅读设置抽屉用法） */
export function idleInnerWebDrawerResolved(): ResolvedInnerWebPresentation {
  return resolveInnerWebPresentation({ layout: 'drawer', drawer: { side: 'bottom' } }, {});
}

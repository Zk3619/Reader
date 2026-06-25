/**
 * 无障碍功能工具函数
 * 用于解决 aria-hidden 警告和其他无障碍相关问题
 */

const APP_ROOT_ID = 'root';

/** 模态打开前：只 blur，不把焦点移到带 aria-hidden 的节点（避免 sentinel 类警告） */
export function clearFocusBeforeModal(): void {
  blurFocusInDismissableOverlay();
  blurFocusInsideAppRoot();
  blurActiveElement();
}

function focusBodyWithoutAriaHidden(): void {
  const body = document.body;
  if (!body) return;
  const prevTabIndex = body.getAttribute('tabindex');
  body.setAttribute('tabindex', '-1');
  body.focus({ preventScroll: true });
  if (prevTabIndex === null) {
    body.removeAttribute('tabindex');
  } else {
    body.setAttribute('tabindex', prevTabIndex);
  }
}

function isFocusInDismissableOverlay(el: HTMLElement): boolean {
  if (el.id.includes('dropdownmenu')) return true;
  return !!(
    el.closest('[role="menu"]') ||
    el.closest('[role="menuitem"]') ||
    el.closest('[role="listbox"]') ||
    el.closest('[role="option"]') ||
    el.closest('[id*="dropdownmenu"]')
  );
}

/** 焦点在菜单 Portal 内时 blur（菜单不在 #root 内） */
export function blurFocusInDismissableOverlay(): void {
  if (typeof document === 'undefined') return;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return;
  if (isFocusInDismissableOverlay(active)) {
    active.blur();
  }
}

/** Kobalte DropdownMenu 的 trigger / 菜单项（关闭后可能仍持焦） */
export function blurOpenDropdownMenuTriggers(): void {
  if (typeof document === 'undefined') return;
  document
    .querySelectorAll<HTMLElement>(
      '[id*="dropdownmenu"][id*="-trigger"], [id*="dropdownmenu"][id*="-item-"]'
    )
    .forEach((el) => el.blur());
  const active = document.activeElement as HTMLElement | null;
  if (active?.id.includes('dropdownmenu')) {
    active.blur();
  }
}

/** 焦点在 #root 内时 blur（模态 dialog aria-hide 前须移出） */
export function blurFocusInsideAppRoot(): void {
  if (typeof document === 'undefined') return;
  const root = document.getElementById(APP_ROOT_ID);
  const active = document.activeElement as HTMLElement | null;
  if (!root || !active || active === document.body) return;
  if (root.contains(active)) {
    active.blur();
  }
}

/**
 * 移除当前焦点，避免焦点变化导致的样式闪烁和 aria-hidden 警告
 * @param element 可选的特定元素，如果不提供则移除当前活动元素的焦点
 */
export function blurActiveElement(element?: HTMLElement | null): void {
  if (element) {
    element.blur();
  } else {
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement && activeElement !== document.body) {
      activeElement.blur();
    }
  }
}

let releasingPageFocus = false;

/** 将焦点移出 #root / 菜单（落到 body，无 aria-hidden） */
export function releasePageFocus(): void {
  if (typeof document === 'undefined' || releasingPageFocus) return;
  releasingPageFocus = true;
  try {
    blurOpenDropdownMenuTriggers();
    clearFocusBeforeModal();
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body) {
      focusBodyWithoutAriaHidden();
    }
  } finally {
    queueMicrotask(() => {
      releasingPageFocus = false;
    });
  }
}

/** 关闭当前 Kobalte 浮层（菜单/选择器等），避免与模态 dialog 叠层时焦点留在浮层内 */
export function dismissOpenKobalteOverlays(): void {
  if (typeof document === 'undefined') return;
  blurFocusInDismissableOverlay();
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    })
  );
}

function hasOpenKobalteDropdownMenu(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector(
    '[id*="dropdownmenu"][data-expanded], [role="menu"][data-expanded]'
  );
}

/** 壳层 Tab / 全屏子页 / 叠层栈变化时：关闭仍挂着的 Popper 菜单与选择器（不波及已打开的 dialog） */
export function dismissFloatingOverlaysForShellChange(): void {
  blurFocusInDismissableOverlay();
  blurOpenDropdownMenuTriggers();
  closeAllSelectMenus();
  if (hasOpenKobalteDropdownMenu()) {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      })
    );
  }
}

/** 从菜单项打开 dialog 时，本帧内 AppDialog.prepare 不再发 Escape */
let skipNextDialogPrepare = false;

/** 阻止菜单 onCloseAutoFocus 把焦点还给 trigger（避免 #root aria-hidden + trigger 焦点） */
let preventMenuCloseAutoFocus = false;

let pendingDialogAfterMenu: (() => void) | null = null;
let pendingDialogFallbackTimer: ReturnType<typeof setTimeout> | undefined;
let pendingDialogRunScheduled = false;

/** Kobalte onCloseAutoFocus 在 sync 内 refocus(trigger) 之后执行 */
export function blurAfterMenuTriggerRefocus(): void {
  queueMicrotask(() => {
    blurOpenDropdownMenuTriggers();
    releasePageFocus();
  });
}

/** 重置单个 Tooltip trigger 的 hover/focus 状态（含尚未打开的 warmup 计时） */
export function resetKobalteTooltipTrigger(trigger: HTMLElement | null | undefined): void {
  if (!trigger) return;
  trigger.dispatchEvent(
    new PointerEvent('pointerleave', {
      bubbles: true,
      cancelable: true,
      pointerType: 'mouse',
    }),
  );
  trigger.blur();
}

export function resetReaderMenuTooltipTrigger(): void {
  if (typeof document === 'undefined') return;
  resetKobalteTooltipTrigger(
    document.querySelector<HTMLElement>('[data-reader-menu-trigger]'),
  );
}

export function resetReaderCatalogTooltipTrigger(): void {
  if (typeof document === 'undefined') return;
  document
    .querySelectorAll<HTMLElement>('[data-reader-catalog-trigger]')
    .forEach((trigger) => resetKobalteTooltipTrigger(trigger));
}

/** Corvu 抽屉关闭后可能 refocus 打开入口，避免 Tooltip 因 focus 误弹出 */
export function dismissOpenKobalteTooltips(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll<HTMLElement>('[role="tooltip"][data-expanded]').forEach((content) => {
    const id = content.id;
    if (!id) return;
    const trigger = document.querySelector<HTMLElement>(`[aria-describedby="${CSS.escape(id)}"]`);
    resetKobalteTooltipTrigger(trigger);
  });
  resetReaderMenuTooltipTrigger();
  resetReaderCatalogTooltipTrigger();
}

/** 遮罩消失后 pointer 仍停在 trigger 上时会误触发 hover tooltip，需延迟恢复 */
export const SETTINGS_DRAWER_TOOLTIP_RESUME_MS = 900;

/** Corvu 抽屉关闭后可能 refocus 打开入口或触发 hover，避免 Tooltip 误弹出 */
export function blurAfterDrawerTriggerRefocus(): void {
  dismissOpenKobalteTooltips();
  queueMicrotask(() => {
    blurActiveElement();
    releasePageFocus();
    dismissOpenKobalteTooltips();
    requestAnimationFrame(() => {
      blurActiveElement();
      releasePageFocus();
      dismissOpenKobalteTooltips();
    });
  });
}

export function shouldPreventMenuCloseAutoFocus(): boolean {
  return preventMenuCloseAutoFocus;
}

/** 在 trigger refocus 之后、dialog aria-hide #root 之前打开 dialog */
function runPendingDialogAfterMenuClose(action: () => void): void {
  const finishFlags = () => {
    queueMicrotask(() => {
      skipNextDialogPrepare = false;
      preventMenuCloseAutoFocus = false;
      pendingDialogRunScheduled = false;
    });
  };

  const openDialog = () => {
    blurOpenDropdownMenuTriggers();
    releasePageFocus();
    skipNextDialogPrepare = true;
    try {
      action();
    } finally {
      requestAnimationFrame(() => {
        blurOpenDropdownMenuTriggers();
        releasePageFocus();
        finishFlags();
      });
    }
  };

  blurOpenDropdownMenuTriggers();
  releasePageFocus();
  blurAfterMenuTriggerRefocus();
  setTimeout(openDialog, 0);
}

function flushPendingDialogAfterMenuClose(): void {
  const action = pendingDialogAfterMenu;
  if (!action || pendingDialogRunScheduled) return;
  pendingDialogAfterMenu = null;
  pendingDialogRunScheduled = true;
  if (pendingDialogFallbackTimer !== undefined) {
    clearTimeout(pendingDialogFallbackTimer);
    pendingDialogFallbackTimer = undefined;
  }
  runPendingDialogAfterMenuClose(action);
}

/** 在 DropdownMenu onCloseAutoFocus 内 sync refocus(trigger) 之后再 flush */
function scheduleFlushAfterMenuCloseAutoFocus(): void {
  requestAnimationFrame(() => {
    flushPendingDialogAfterMenuClose();
  });
}

/**
 * 登记待执行回调：在菜单 onCloseAutoFocus（含 trigger refocus）之后再执行。
 * 用于开弹窗、切页、开全屏子页等，避免锚点随 DOM 隐藏后 Popper 闪到左上角（Android 常见）。
 */
export function deferUntilMenuDismissed(action: () => void): void {
  preventMenuCloseAutoFocus = true;
  pendingDialogAfterMenu = action;
  pendingDialogRunScheduled = false;
  clearFocusBeforeModal();
  if (pendingDialogFallbackTimer !== undefined) {
    clearTimeout(pendingDialogFallbackTimer);
  }
  pendingDialogFallbackTimer = setTimeout(() => flushPendingDialogAfterMenuClose(), 100);
}

/**
 * AppDropdownMenuContent.onCloseAutoFocus：须在 Kobalte refocus trigger 之后再 flush。
 * （Kobalte 先调用户回调，再 focusWithoutScrolling(trigger)，最后 preventDefault）
 */
export function handleMenuCloseAutoFocusForPendingDialog(event: {
  preventDefault: () => void;
}): boolean {
  if (!preventMenuCloseAutoFocus || !pendingDialogAfterMenu) return false;
  event.preventDefault();
  if (pendingDialogFallbackTimer !== undefined) {
    clearTimeout(pendingDialogFallbackTimer);
    pendingDialogFallbackTimer = undefined;
  }
  blurAfterMenuTriggerRefocus();
  scheduleFlushAfterMenuCloseAutoFocus();
  return true;
}

/**
 * 打开 AppDialog 时调用：关闭其它浮层并把焦点移出 #root（仅一次）
 */
export function prepareForAppDialogOpen(): void {
  if (skipNextDialogPrepare) {
    releasePageFocus();
    window.dispatchEvent(new CustomEvent(ACCESSIBILITY_EVENTS.DIALOG_OPENED));
    return;
  }
  closeAllSelectMenus();
  releasePageFocus();
  window.dispatchEvent(new CustomEvent(ACCESSIBILITY_EVENTS.DIALOG_OPENED));
}

/**
 * 创建一个包装函数，在执行回调后自动移除焦点
 * 用于 Switch、Button 等组件的 onChange/onClick 事件
 * 
 * @param callback 原始回调函数
 * @param element 可选的特定元素，如果不提供则移除当前活动元素的焦点
 * @returns 包装后的回调函数
 * 
 * @example
 * ```tsx
 * <Switch
 *   checked={value()}
 *   onChange={withBlurAfter((checked) => {
 *     setValue(checked);
 *   })}
 * />
 * ```
 */
export function withBlurAfter<T extends (...args: any[]) => any>(
  callback: T,
  element?: HTMLElement | null
): T {
  return ((...args: Parameters<T>) => {
    const result = callback(...args);
    // 使用 queueMicrotask 确保在状态更新和 DOM 更新完成后再移除焦点
    // 这样可以避免状态更新导致的重新渲染时焦点变化
    queueMicrotask(() => {
      blurActiveElement(element);
    });
    return result;
  }) as T;
}

/**
 * 创建一个包装函数，在执行回调前移除焦点
 * 用于 DropdownMenuTrigger、DialogTrigger 等组件的 onClick 事件
 * 
 * @param callback 原始回调函数
 * @param element 可选的特定元素，如果不提供则移除当前活动元素的焦点
 * @returns 包装后的回调函数
 * 
 * @example
 * ```tsx
 * <DropdownMenuTrigger
 *   as={(props: any) => (
 *     <Button
 *       {...props}
 *       onClick={withBlurBefore(props.onClick)}
 *     />
 *   )}
 * />
 * ```
 */
export function withBlurBefore<T extends (event: Event) => any>(
  callback: T | undefined,
  element?: HTMLElement | null
): T {
  return ((event: Event) => {
    blurActiveElement(element || (event.currentTarget as HTMLElement));
    return callback?.(event);
  }) as T;
}

/**
 * 事件名称常量
 */
export const ACCESSIBILITY_EVENTS = {
  /** 对话框打开事件，用于通知其他组件关闭下拉菜单 */
  DIALOG_OPENED: 'dialog-opened',
  /** 下拉菜单打开事件，用于通知其他组件关闭对话框和下拉菜单 */
  DROPDOWN_MENU_OPENED: 'dropdown-menu-opened',
} as const;

/**
 * 设置无障碍事件监听器
 * 用于在组件挂载时监听对话框和下拉菜单的打开事件
 * 
 * @param handlers 事件处理器对象
 * @returns 清理函数，用于在组件卸载时移除监听器
 * 
 * @example
 * ```tsx
 * onMount(() => {
 *   const cleanup = setupAccessibilityListeners({
 *     onDialogOpened: () => {
 *       setSelectOpen(false);
 *     },
 *     onDropdownMenuOpened: () => {
 *       setSelectOpen(false);
 *     },
 *   });
 *   
 *   return cleanup;
 * });
 * ```
 */
export function setupAccessibilityListeners(handlers: {
  onDialogOpened?: () => void;
  onDropdownMenuOpened?: () => void;
}): () => void {
  const handleDialogOpened = () => {
    handlers.onDialogOpened?.();
  };

  const handleDropdownMenuOpened = () => {
    handlers.onDropdownMenuOpened?.();
  };

  if (handlers.onDialogOpened) {
    window.addEventListener(ACCESSIBILITY_EVENTS.DIALOG_OPENED, handleDialogOpened);
  }

  if (handlers.onDropdownMenuOpened) {
    window.addEventListener(ACCESSIBILITY_EVENTS.DROPDOWN_MENU_OPENED, handleDropdownMenuOpened);
  }

  return () => {
    if (handlers.onDialogOpened) {
      window.removeEventListener(ACCESSIBILITY_EVENTS.DIALOG_OPENED, handleDialogOpened);
    }
    if (handlers.onDropdownMenuOpened) {
      window.removeEventListener(ACCESSIBILITY_EVENTS.DROPDOWN_MENU_OPENED, handleDropdownMenuOpened);
    }
  };
}

/**
 * 全局存储所有打开的 Select 和 DropdownMenu 的关闭函数
 */
const openSelectMenus = new Set<() => void>();

/**
 * 注册一个 Select 或 DropdownMenu 的关闭函数
 * @param closeFn 关闭函数
 * @returns 取消注册函数
 */
export function registerSelectMenu(closeFn: () => void): () => void {
  openSelectMenus.add(closeFn);
  return () => {
    openSelectMenus.delete(closeFn);
  };
}

/**
 * 关闭所有打开的 Select 和 DropdownMenu
 */
export function closeAllSelectMenus(): void {
  openSelectMenus.forEach(closeFn => {
    try {
      closeFn();
    } catch (e) {
      console.warn('关闭 Select/DropdownMenu 失败:', e);
    }
  });
  openSelectMenus.clear();
}

/**
 * 触发对话框打开事件
 * 用于在对话框打开时通知其他组件
 * 会自动关闭所有打开的 Select 和 DropdownMenu
 * 
 * @example
 * ```tsx
 * <Dialog
 *   onOpenChange={(open) => {
 *     if (open) {
 *       triggerDialogOpened();
 *     }
 *   }}
 * />
 * ```
 */
export function triggerDialogOpened(): void {
  prepareForAppDialogOpen();
}

/**
 * 触发下拉菜单打开事件
 * 用于在下拉菜单打开时通知其他组件
 * 
 * @example
 * ```tsx
 * <DropdownMenu
 *   onOpenChange={(open) => {
 *     if (open) {
 *       triggerDropdownMenuOpened();
 *     }
 *   }}
 * />
 * ```
 */
export function triggerDropdownMenuOpened(): void {
  window.dispatchEvent(new CustomEvent(ACCESSIBILITY_EVENTS.DROPDOWN_MENU_OPENED));
}

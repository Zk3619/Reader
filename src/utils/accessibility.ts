/**
 * 无障碍功能工具函数
 * 用于解决 aria-hidden 警告和其他无障碍相关问题
 */

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
  // 先关闭所有打开的 Select 和 DropdownMenu
  closeAllSelectMenus();
  // 然后触发事件通知其他组件
  window.dispatchEvent(new CustomEvent(ACCESSIBILITY_EVENTS.DIALOG_OPENED));
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

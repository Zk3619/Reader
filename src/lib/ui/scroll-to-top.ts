/**
 * 滚动行为：尊重系统/应用「减少动效」时改为瞬时跳转。
 */

export function scrollToTop(
  el: HTMLElement,
  options?: { reduceMotion?: boolean },
): void {
  el.scrollTo({
    top: 0,
    behavior: options?.reduceMotion ? 'auto' : 'smooth',
  });
}

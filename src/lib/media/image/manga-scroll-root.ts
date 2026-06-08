/** 漫画滚动区 data 属性，供 IntersectionObserver root */
export const MANGA_SCROLL_ROOT_ATTR = 'data-manga-scroll';

function isScrollableOverflow(value: string): boolean {
  return value === 'auto' || value === 'scroll' || value === 'overlay';
}

/** 从插图容器向上解析 IO 滚动根：优先带标记且可滚动的节点，否则取最近可滚动祖先 */
export function resolveMangaScrollIntersectionRoot(
  el: HTMLElement,
  rootAttr: string = MANGA_SCROLL_ROOT_ATTR,
): Element | null {
  const marked = el.closest<HTMLElement>(`[${rootAttr}]`);
  if (marked) {
    const style = getComputedStyle(marked);
    if (
      isScrollableOverflow(style.overflowY) ||
      isScrollableOverflow(style.overflow)
    ) {
      return marked;
    }
    let parent = marked.parentElement;
    while (parent) {
      const ps = getComputedStyle(parent);
      if (isScrollableOverflow(ps.overflowY) || isScrollableOverflow(ps.overflow)) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return marked;
  }

  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (isScrollableOverflow(style.overflowY) || isScrollableOverflow(style.overflow)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

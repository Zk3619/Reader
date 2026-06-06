/** 翻页动画：克隆 live 正文节点并应用目标页纵向偏移 */
export function mountTurnPageClone(
  mount: HTMLElement,
  liveInner: HTMLElement,
  pageStartPx: number,
  options?: { minHeightPx?: number },
): void {
  mount.replaceChildren();
  const clone = liveInner.cloneNode(true) as HTMLElement;
  clone.setAttribute('aria-hidden', 'true');
  clone.classList.add('reader-paged-turn-clone');
  clone.style.pointerEvents = 'none';
  clone.style.marginTop = '';
  clone.style.willChange = 'auto';
  const offsetY = Math.round(pageStartPx);
  clone.style.transform = offsetY > 0 ? `translate3d(0, ${-offsetY}px, 0)` : '';
  if (options?.minHeightPx != null && options.minHeightPx > 0) {
    clone.style.minHeight = `${options.minHeightPx}px`;
  }
  mount.appendChild(clone);
}

export function clearTurnPageClone(mount: HTMLElement | undefined): void {
  mount?.replaceChildren();
}

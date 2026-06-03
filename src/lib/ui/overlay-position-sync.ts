/**
 * 浮层（Popper / Dialog）在页面入场动画或首次布局未稳定时，位置可能为 0 或不可见。
 * 打开时触发 resize，让 Floating UI 在下一帧及动画结束后重新测量锚点。
 */
export function scheduleOverlayPositionSync(): void {
  if (typeof window === 'undefined') return;
  const bump = () => window.dispatchEvent(new Event('resize'));
  requestAnimationFrame(() => {
    requestAnimationFrame(bump);
    window.setTimeout(bump, 520);
  });
}

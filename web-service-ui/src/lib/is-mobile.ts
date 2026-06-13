/** 窄屏 / 触摸设备检测（Web UI 客户端） */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export function isNarrowViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 768px)').matches;
}

export function isMobileWebUi(): boolean {
  return isNarrowViewport() || isCoarsePointer();
}

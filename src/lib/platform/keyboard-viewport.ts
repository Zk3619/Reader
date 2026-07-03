/**
 * 移动端 / WebView 输入法（IME）视口适配。
 * 通过 visualViewport 计算键盘占用高度，写入 CSS 变量供 fixed 底栏等使用。
 */

import { subscribeViewportGeometryChange } from '@/lib/platform/viewport-geometry';

const KEYBOARD_THRESHOLD_PX = 80;

let installed = false;

function computeKeyboardInset(): number {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  const inset = window.innerHeight - vv.height - vv.offsetTop;
  return inset > KEYBOARD_THRESHOLD_PX ? Math.round(inset) : 0;
}

function applyKeyboardInset(): void {
  const inset = computeKeyboardInset();
  const root = document.documentElement;
  root.style.setProperty('--keyboard-inset-bottom', `${inset}px`);
  root.classList.toggle('keyboard-open', inset > 0);
}

export function installKeyboardViewport(): () => void {
  if (installed || typeof window === 'undefined') return () => undefined;
  installed = true;

  applyKeyboardInset();

  const unsubscribeGeometry = subscribeViewportGeometryChange(() => applyKeyboardInset());

  const onFocusIn = (ev: FocusEvent) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('input, textarea, select, [contenteditable="true"]')) return;
    requestAnimationFrame(() => {
      applyKeyboardInset();
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };
  document.addEventListener('focusin', onFocusIn, true);

  const onFocusOut = () => {
    requestAnimationFrame(applyKeyboardInset);
  };
  document.addEventListener('focusout', onFocusOut, true);

  return () => {
    unsubscribeGeometry();
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    document.documentElement.style.removeProperty('--keyboard-inset-bottom');
    document.documentElement.classList.remove('keyboard-open');
    installed = false;
  };
}

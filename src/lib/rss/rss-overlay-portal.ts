/**
 * RSS 全屏浮层 Portal 宿主（文章列表 / 阅读页）
 * 避免 Solid Portal 无尺寸 wrapper 导致内部 fixed 无法铺满视口。
 */

const HOST_ID = 'reader-rss-overlay-portal-host';

export function ensureRssOverlayPortalHost(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('document unavailable');
  }
  let el = document.getElementById(HOST_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = HOST_ID;
    el.setAttribute('data-rss-overlay-portal-host', '');
    document.body.appendChild(el);
  }
  return el;
}

export function getRssOverlayPortalMount(): HTMLElement {
  return ensureRssOverlayPortalHost();
}

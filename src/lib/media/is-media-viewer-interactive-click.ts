/** 主内容区内可交互元素：点击时不应切换顶/底栏 */
const MEDIA_VIEWER_INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'iframe',
  'audio',
  '[role="button"]',
  '[role="link"]',
  '[role="slider"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[contenteditable="true"]',
  '.reader-legado-cmt-img',
  '[data-legado-cmt]',
  '.reader-comment-bubble',
  '[data-media-viewer-interactive-zone]',
].join(',');

/** 点击是否落在可交互内容上（含其内部子节点） */
export function isMediaViewerInteractiveClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(MEDIA_VIEWER_INTERACTIVE_SELECTOR));
}

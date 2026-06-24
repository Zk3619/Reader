import { READER_THEME_DEFAULT_BG } from '@/lib/media/text/reader-theme-classes';
import { mergePagedContentTransforms } from '@/lib/media/text/reader-paged-turn-style';
import type { TextViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';

export const READER_PAGED_TURN_SLIDE_CLASS = 'reader-paged-turn-slide';
export const READER_PAGED_TURN_CONTENT_CLIP_CLASS = 'reader-paged-turn-content-clip';

const SLIDE_CLASS = READER_PAGED_TURN_SLIDE_CLASS;
const INCOMING_MOUNT_CLASS = 'reader-paged-incoming-mount';
const CONTENT_CLIP_CLASS = READER_PAGED_TURN_CONTENT_CLIP_CLASS;

/** Solid 重渲染可能 detach 幕帘节点；保留引用以便重新挂回，避免误从已翻页的 live 再 clone */
let persistedTurnSlide: HTMLElement | null = null;
/** 跨章 incoming：新章目标页 clone，挂在 JSX incoming-mount 内 */
let persistedIncomingMount: HTMLElement | null = null;

export function getPersistedTurnSlide(): HTMLElement | null {
  return persistedTurnSlide;
}

/** 向上查找不透明页面背景色（幕帘 / 仿真背面折痕底色） */
export function resolveOpaquePageBackground(
  startEl: HTMLElement,
  fallbackBg?: string,
): string {
  let node: HTMLElement | null = startEl;
  while (node) {
    if (
      node.classList.contains('reader-paged-live-inner') ||
      node.classList.contains('reader-paged-page-window') ||
      node.classList.contains('reader-text-content-slot')
    ) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        return bg;
      }
    }
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      return bg;
    }
    node = node.parentElement;
  }
  return fallbackBg ?? READER_THEME_DEFAULT_BG;
}

/** 克隆后清理：去掉 live 隐藏样式、剥离 staging/测量宿主，避免幕帘白屏 */
export function sanitizeClonedTurnPageSurface(root: HTMLElement): void {
  root.style.visibility = 'visible';
  root.style.opacity = '';
  root.querySelectorAll(
    '.reader-paged-measure-host, .reader-paged-incoming-inner',
  ).forEach((node) => {
    node.remove();
  });
  root.querySelectorAll(
    '.reader-paged-live-inner, .reader-body, .reader-content',
  ).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.visibility = 'visible';
    node.style.opacity = '';
  });
}

/** 克隆含页眉页脚的整页 content-frame（滑动幕帘在 always 模式使用） */
export function buildPageFrameClone(
  frameEl: HTMLElement,
  _liveInner: HTMLElement,
  pageStartPx: number,
  pageBg: string,
): HTMLElement {
  const clone = frameEl.cloneNode(true) as HTMLElement;
  sanitizeClonedTurnPageSurface(clone);
  clone.setAttribute('aria-hidden', 'true');
  clone.classList.add('reader-paged-turn-frame-clone');
  clone.style.pointerEvents = 'none';
  clone.style.position = 'absolute';
  clone.style.inset = '0';
  clone.style.width = '100%';
  clone.style.height = '100%';
  clone.style.margin = '0';
  clone.style.boxSizing = 'border-box';
  clone.style.overflow = 'hidden';
  clone.style.backgroundColor = pageBg;

  const srcStyle = getComputedStyle(frameEl);
  clone.style.paddingTop = srcStyle.paddingTop;
  clone.style.paddingRight = srcStyle.paddingRight;
  clone.style.paddingBottom = srcStyle.paddingBottom;
  clone.style.paddingLeft = srcStyle.paddingLeft;

  const innerEl =
    clone.querySelector<HTMLElement>('.reader-paged-live-inner') ??
    clone.querySelector<HTMLElement>('[data-reader-render-page]');
  if (innerEl) {
    innerEl.classList.add('reader-paged-turn-surface');
    innerEl.style.backgroundColor = pageBg;
    const y = Math.round(pageStartPx);
    innerEl.style.transform =
      mergePagedContentTransforms(y) ?? (y > 0 ? `translate3d(0, ${-y}px, 0)` : '');
    innerEl.style.willChange = 'transform';
  }
  return clone;
}

/** 克隆 live 页面表面（幕帘 / 仿真下层区共用） */
export function buildPageSurfaceClone(
  liveInner: HTMLElement,
  pageStartPx: number,
  pageBg: string,
): HTMLElement {
  const curtain = liveInner.cloneNode(true) as HTMLElement;
  sanitizeClonedTurnPageSurface(curtain);
  curtain.setAttribute('aria-hidden', 'true');
  curtain.classList.add('reader-paged-turn-curtain', 'reader-paged-turn-surface');
  curtain.style.pointerEvents = 'none';
  curtain.style.marginTop = '';
  curtain.style.minHeight = '';
  curtain.style.height = '';
  curtain.style.willChange = 'transform';
  curtain.style.width = '100%';
  curtain.style.backgroundColor = pageBg;
  curtain.style.transform = '';
  curtain.style.visibility = 'visible';

  const y = Math.round(pageStartPx);
  curtain.style.transform =
    mergePagedContentTransforms(y) ?? (y > 0 ? `translate3d(0, ${-y}px, 0)` : '');
  return curtain;
}

/**
 * 覆盖翻页：克隆当前可见页作为滑动幕帘。
 * slideMount 必须是 JSX 中的空容器（仅 ref），避免 Solid 重渲染清掉 append 的节点。
 *
 * contentSpanPx = nextStart - pageStart（与静止阅读 page-window 同高，禁止用满 clipHeight）
 */
export function mountTurnPageCurtain(
  turnLayer: HTMLElement,
  slideMount: HTMLElement,
  liveInner: HTMLElement,
  pageStartPx: number,
  options?: {
    contentSpanPx?: number;
    /** @deprecated slideMount 已与 content-slot 同几何时不再使用 */
    viewportHeightPx?: number;
    /** 覆盖：slideMount 由 JSX 对齐 content-slot 四边 inset，此处仅用于语义标记 */
    contentInsetPx?: TextViewerPagedContentInsets;
    /** 滑动/仿真：满视口页面板（padding 承载 inset，与 incoming 一致） */
    slideViewportPanel?: boolean;
    /** @deprecated 使用 slideViewportPanel */
    slideFillMount?: boolean;
    /** 主题背景色（避免幕帘回落到默认主题 0） */
    pageBg?: string;
    /** 页眉页脚随翻页：克隆整页 content-frame */
    carryPageTips?: boolean;
    frameEl?: HTMLElement;
  },
): void {
  clearTurnPageCurtain(turnLayer, slideMount);

  const contentSpan = Math.max(1, Math.round(options?.contentSpanPx ?? 0));
  const pageBg = options?.pageBg ?? resolveOpaquePageBackground(liveInner);
  const carryTips = Boolean(options?.carryPageTips && options?.frameEl);

  const slide = document.createElement('div');
  slide.style.backgroundColor = pageBg;

  if (carryTips && options?.frameEl) {
    const frameClone = buildPageFrameClone(
      options.frameEl,
      liveInner,
      pageStartPx,
      pageBg,
    );
    slide.className = `${SLIDE_CLASS} absolute inset-0 overflow-hidden box-border`;
    slide.style.width = '100%';
    slide.style.height = '100%';
    slide.appendChild(frameClone);
  } else {
    const curtain = buildPageSurfaceClone(liveInner, pageStartPx, pageBg);
    slide.className = `${SLIDE_CLASS} absolute inset-0 overflow-hidden box-border`;

    const contentClip = document.createElement('div');
    contentClip.className = `${CONTENT_CLIP_CLASS} absolute inset-x-0 top-0 overflow-hidden`;
    contentClip.style.height = `${contentSpan}px`;
    contentClip.style.backgroundColor = pageBg;
    contentClip.appendChild(curtain);
    slide.appendChild(contentClip);
  }

  persistedTurnSlide = slide;
  slideMount.appendChild(slide);
  setCurtainHostActive(turnLayer, true);
}

/**
 * 跨章 incoming：在新章 DOM 就绪后 clone 目标页到 JSX incoming-mount（与 outgoing 幕帘对称）。
 */
export function mountCrossChapterIncomingPanel(
  mount: HTMLElement,
  liveInner: HTMLElement,
  pageStartPx: number,
  contentSpanPx: number,
  pageBg?: string,
): void {
  clearCrossChapterIncomingPanel(mount);

  const bg = pageBg ?? resolveOpaquePageBackground(liveInner);
  const span = Math.max(1, Math.round(contentSpanPx));
  const curtain = buildPageSurfaceClone(liveInner, pageStartPx, bg);

  const panel = document.createElement('div');
  panel.className = `${INCOMING_MOUNT_CLASS} absolute inset-0 overflow-hidden box-border pointer-events-none`;
  panel.style.backgroundColor = bg;
  panel.style.height = `${span}px`;

  const contentClip = document.createElement('div');
  contentClip.className = `${CONTENT_CLIP_CLASS} relative w-full overflow-hidden`;
  contentClip.style.height = `${span}px`;
  contentClip.style.backgroundColor = bg;
  contentClip.appendChild(curtain);
  panel.appendChild(contentClip);

  persistedIncomingMount = panel;
  mount.appendChild(panel);
}

export function clearCrossChapterIncomingPanel(mount?: HTMLElement): void {
  if (persistedIncomingMount) {
    persistedIncomingMount.remove();
    persistedIncomingMount = null;
  } else {
    mount?.querySelector(`.${INCOMING_MOUNT_CLASS}`)?.remove();
  }
}

export function ensureCrossChapterIncomingAttached(mount: HTMLElement | undefined): boolean {
  const panel = persistedIncomingMount;
  if (!panel || !mount) return false;
  if (mount.contains(panel)) return false;
  mount.appendChild(panel);
  return true;
}

/** Solid  reconcile 后若幕帘被 detach，挂回同一 slide（勿再 clone live） */
export function ensureTurnCurtainAttached(
  turnLayer: HTMLElement | undefined,
  slideMount: HTMLElement | undefined,
): boolean {
  const slide = persistedTurnSlide;
  if (!slide || !slideMount) return false;
  if (slideMount.contains(slide)) return false;
  slideMount.appendChild(slide);
  setCurtainHostActive(turnLayer, true);
  return true;
}

export function clearTurnPageCurtain(
  turnLayer: HTMLElement | undefined,
  slideMount: HTMLElement | undefined,
): void {
  if (persistedTurnSlide) {
    persistedTurnSlide.remove();
    persistedTurnSlide = null;
  } else {
    slideMount?.querySelector(`.${SLIDE_CLASS}`)?.remove();
  }
  if (turnLayer) {
    turnLayer.style.transform = '';
    turnLayer.style.willChange = '';
    setCurtainHostActive(turnLayer, false);
  }
}

/** 横向翻页 transform：施加在 turn 层，使 outgoing 页与书脊边线一起滑动 */
export function setTurnCurtainTransform(
  turnLayer: HTMLElement | undefined,
  transform: string | undefined,
): void {
  if (!turnLayer) return;
  turnLayer.style.transform = transform ?? '';
  turnLayer.style.willChange = transform ? 'transform' : '';
}

export function setCurtainHostActive(turnLayer: HTMLElement | undefined, active: boolean): void {
  if (!turnLayer) return;
  turnLayer.style.zIndex = active ? '10' : '';
  turnLayer.toggleAttribute('data-turn-active', active);
}

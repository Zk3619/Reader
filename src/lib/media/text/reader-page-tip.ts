import type { TextViewerPageTipsConfig, TextViewerPageTipInsets } from '@/lib/media/text/reader-ui-config';
import { isMobile } from '@/lib/platform/detect';

const READER_PAGE_TIP_SAFE_TOP = 'var(--safe-area-top-effective, env(safe-area-inset-top, 0px))';
const READER_PAGE_TIP_SAFE_BOTTOM =
  'var(--safe-area-bottom-effective, env(safe-area-inset-bottom, 0px))';

/** 移动端页眉/页脚额外安全区（桌面为 0） */
export function readerPageTipSafeInsetPx(position: 'header' | 'footer'): number {
  if (!isMobile() || typeof document === 'undefined') return 0;
  const prop =
    position === 'header' ? '--safe-area-top-effective' : '--safe-area-bottom-effective';
  const raw = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
  if (!raw) return 0;
  const px = parseFloat(raw);
  return Number.isFinite(px) ? px : 0;
}

/** 页眉/页脚四边 padding：桌面贴边；移动端顶/底叠加系统安全区 */
export function readerPageTipBarEdgePaddingStyle(
  position: 'header' | 'footer',
  inset: TextViewerPageTipInsets,
): Record<string, string> {
  const mobile = isMobile();
  return {
    'padding-left': `${inset.left}px`,
    'padding-right': `${inset.right}px`,
    'padding-top':
      position === 'header' && mobile
        ? inset.top > 0
          ? `calc(${inset.top}px + ${READER_PAGE_TIP_SAFE_TOP})`
          : READER_PAGE_TIP_SAFE_TOP
        : `${inset.top}px`,
    'padding-bottom':
      position === 'footer' && mobile
        ? inset.bottom > 0
          ? `calc(${inset.bottom}px + ${READER_PAGE_TIP_SAFE_BOTTOM})`
          : READER_PAGE_TIP_SAFE_BOTTOM
        : `${inset.bottom}px`,
  };
}

/** 页眉/页脚信息条类型（对齐 Legado ReadTipConfig） */
export type ReaderPageTipType =
  | 'none'
  | 'bookName'
  | 'chapterTitle'
  | 'time'
  | 'battery'
  | 'batteryPercentage'
  | 'page'
  | 'totalProgress'
  | 'totalProgress1'
  | 'pageAndTotal'
  | 'timeBattery'
  | 'timeBatteryIconOnly'
  | 'timeBatteryPercentage';

export const READER_PAGE_TIP_TYPE_LABELS: Record<ReaderPageTipType, string> = {
  none: '无',
  bookName: '书名',
  chapterTitle: '标题',
  time: '时间',
  battery: '电量',
  batteryPercentage: '电量%',
  page: '页数',
  totalProgress: '进度(%)',
  totalProgress1: '进度(xx/yyy)',
  pageAndTotal: '页数及进度',
  timeBattery: '时间及电量',
  timeBatteryIconOnly: '时间和电量',
  timeBatteryPercentage: '时间及电量%',
};

export const READER_PAGE_TIP_TYPE_OPTIONS: ReaderPageTipType[] = [
  'none',
  'bookName',
  'chapterTitle',
  'time',
  'battery',
  'batteryPercentage',
  'page',
  'totalProgress',
  'totalProgress1',
  'pageAndTotal',
  'timeBattery',
  'timeBatteryIconOnly',
  'timeBatteryPercentage',
];

export const READER_PAGE_TIP_HEADER_MODE_LABELS = {
  follow: '跟随顶栏',
  always: '始终显示',
  never: '始终隐藏',
} as const;

export const READER_PAGE_TIP_FOOTER_MODE_LABELS = {
  follow: '跟随底栏',
  always: '始终显示',
  never: '始终隐藏',
} as const;

export function normalizeTextViewerPageTipFooterMode(
  raw: unknown,
): TextViewerPageTipsConfig['footerMode'] {
  if (raw === 'show') return 'always';
  if (raw === 'hide') return 'never';
  if (raw === 'follow' || raw === 'always' || raw === 'never') return raw;
  return 'never';
}

export interface ReaderPageTipContext {
  bookName?: string;
  chapterTitle?: string;
  pageIndex: number;
  pageCount: number;
  bookProgressPercent: number;
  bookProgressLabel?: string;
}

let batteryLevelCache: number | null = null;

export function refreshReaderBatteryLevel(): void {
  if (typeof navigator === 'undefined' || !('getBattery' in navigator)) {
    batteryLevelCache = null;
    return;
  }
  void (navigator as Navigator & { getBattery?: () => Promise<{ level: number }> })
    .getBattery?.()
    .then((b) => {
      batteryLevelCache = Math.round(b.level * 100);
    })
    .catch(() => {
      batteryLevelCache = null;
    });
}

if (typeof window !== 'undefined') {
  refreshReaderBatteryLevel();
}

function formatTime(now = new Date()): string {
  const h = now.getHours();
  const m = now.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function batteryText(mode: 'icon' | 'percent' | 'both'): string {
  const level = batteryLevelCache;
  if (level == null) return '--';
  if (mode === 'icon' || mode === 'both') return `${level}%`;
  return `${level}%`;
}

export function resolveReaderPageTipText(
  type: ReaderPageTipType,
  ctx: ReaderPageTipContext,
): string {
  switch (type) {
    case 'none':
      return '';
    case 'bookName':
      return ctx.bookName ?? '';
    case 'chapterTitle':
      return ctx.chapterTitle ?? '';
    case 'time':
      return formatTime();
    case 'battery':
      return batteryText('both');
    case 'batteryPercentage':
      return batteryText('percent');
    case 'page':
      return ctx.pageCount > 0 ? `${ctx.pageIndex + 1}/${ctx.pageCount}` : '';
    case 'totalProgress':
      return `${Math.round(ctx.bookProgressPercent * 100)}%`;
    case 'totalProgress1':
      return ctx.bookProgressLabel ?? `${Math.round(ctx.bookProgressPercent * 100)}%`;
    case 'pageAndTotal': {
      const page =
        ctx.pageCount > 0 ? `${ctx.pageIndex + 1}/${ctx.pageCount}` : '';
      const pct = `${Math.round(ctx.bookProgressPercent * 100)}%`;
      return page ? `${page}  ${pct}` : pct;
    }
    case 'timeBattery':
      return `${formatTime()}  ${batteryText('percent')}`;
    case 'timeBatteryIconOnly':
      return `${formatTime()}  ${batteryText('icon')}`;
    case 'timeBatteryPercentage':
      return `${formatTime()}  ${batteryText('percent')}`;
    default:
      return '';
  }
}

type TipSlotKey = 'headerLeft' | 'headerMiddle' | 'headerRight' | 'footerLeft' | 'footerMiddle' | 'footerRight';

export function readerPageTipSlotValue(
  tips: TextViewerPageTipsConfig,
  slot: TipSlotKey,
): ReaderPageTipType {
  return tips[slot] ?? 'none';
}

export function readerPageTipBarVisible(
  position: 'header' | 'footer',
  tips: TextViewerPageTipsConfig,
  chromeBarsVisible: boolean,
): boolean {
  if (position === 'header') {
    if (tips.headerMode === 'never') return false;
    // 跟随顶栏：顶栏显示时页眉显示在其下方；沉浸（顶栏隐藏）时隐藏页眉
    if (tips.headerMode === 'follow' && !chromeBarsVisible) return false;
  } else {
    if (tips.footerMode === 'never') return false;
    // 跟随底栏：底栏显示时页脚显示在其上方；沉浸时隐藏页脚
    if (tips.footerMode === 'follow' && !chromeBarsVisible) return false;
  }

  const slots: TipSlotKey[] =
    position === 'header'
      ? ['headerLeft', 'headerMiddle', 'headerRight']
      : ['footerLeft', 'footerMiddle', 'footerRight'];

  return slots.some((s) => readerPageTipSlotValue(tips, s) !== 'none');
}

export function readerPageTipBarHeightPx(
  position: 'header' | 'footer',
  tips: TextViewerPageTipsConfig,
  chromeBarsVisible: boolean,
): number {
  if (!readerPageTipBarVisible(position, tips, chromeBarsVisible)) return 0;

  const fontSize = position === 'header' ? tips.headerFontSize : tips.footerFontSize;
  const inset = position === 'header' ? tips.headerInset : tips.footerInset;
  const showLine = position === 'header' ? tips.showHeaderLine : tips.showFooterLine;
  const lineHeight = Math.max(12, fontSize) * 1.35;
  /** h-px + mt-1/mb-1（4px） */
  const dividerBlock = showLine ? 5 : 0;
  let height = inset.top + inset.bottom + lineHeight + dividerBlock;
  if (isMobile()) {
    height += readerPageTipSafeInsetPx(position);
  }
  return height;
}

export interface ReaderPageTipChromePads {
  top: number;
  bottom: number;
}

/** 页眉/页脚之间的正文区预算（隐藏 tip 时 pad=0，正文自动撑满 frame） */
export interface ReaderPageTipContentBudget {
  headerPad: number;
  footerPad: number;
  bodyHeightPx: number;
}

/**
 * 正文显示与 DOM 分页共用的垂直预算。
 * tip-body 已布局时以其 clientHeight 为唯一正文高；页眉/页脚 pad 与 frame−body 对齐。
 */
export function readerPageTipContentBudget(
  frameEl: HTMLElement | null | undefined,
  tips: TextViewerPageTipsConfig,
  chromeBarsVisible: boolean,
  pageTipBodyEl?: HTMLElement | null,
): ReaderPageTipContentBudget {
  const headerVisible = readerPageTipBarVisible('header', tips, chromeBarsVisible);
  const footerVisible = readerPageTipBarVisible('footer', tips, chromeBarsVisible);
  const pads = measureReaderPageTipChromePads(frameEl, tips, chromeBarsVisible);
  const headerPad = headerVisible ? pads.top : 0;
  const footerPad = footerVisible ? pads.bottom : 0;

  const frameH = frameEl?.clientHeight ?? 0;
  const tipBodyEl =
    pageTipBodyEl ??
    frameEl?.querySelector<HTMLElement>('.reader-page-tip-body') ??
    null;
  const tipBodyDom = readReaderPageTipBodyClientHeightPx(tipBodyEl);

  if (tipBodyDom > 0 && frameH > 0) {
    return { headerPad, footerPad, bodyHeightPx: tipBodyDom };
  }

  if (frameH <= 0) {
    return { headerPad, footerPad, bodyHeightPx: 0 };
  }

  let bodyHeightPx = Math.max(1, frameH - headerPad - footerPad);
  if (frameEl) {
    const measured = measureReaderPageTipBodyHeightPx(
      frameEl,
      tips,
      chromeBarsVisible,
      pageTipBodyEl,
    );
    if (measured > 0) {
      bodyHeightPx = measured;
    }
  }

  return { headerPad, footerPad, bodyHeightPx };
}

/** tip-body 元素实测正文带高度（0 表示未挂载或尚未布局） */
export function readReaderPageTipBodyClientHeightPx(
  tipBodyEl?: HTMLElement | null,
): number {
  if (!tipBodyEl) return 0;
  const h = tipBodyEl.clientHeight;
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Math.max(1, Math.floor(h));
}

function resolveReaderPageTipBodyEl(
  frameEl: HTMLElement | null | undefined,
  pageTipBodyEl?: HTMLElement | null,
): HTMLElement | null {
  if (pageTipBodyEl) return pageTipBodyEl;
  return frameEl?.querySelector<HTMLElement>('.reader-page-tip-body') ?? null;
}

function finiteOffsetHeight(el: HTMLElement): number {
  const h = el.offsetHeight;
  return Number.isFinite(h) && h > 0 ? h : 0;
}

/** 页眉/页脚条实测高；DOM 未就绪时回退估算 */
function measureTipBarHeightPx(
  bar: HTMLElement | null | undefined,
  estimate: number,
): number {
  if (!bar) return estimate > 0 ? estimate : 0;
  const rectH = Math.ceil(bar.getBoundingClientRect().height);
  const offsetH = finiteOffsetHeight(bar);
  const dom = Math.max(rectH, offsetH);
  return dom > 0 ? dom : estimate > 0 ? estimate : 0;
}

/** 页眉底与页脚顶之间的实测间隙；过小视为布局未稳定，回退算术预算 */
function acceptTipBodyGapPx(gap: number, expected: number): number {
  if (gap <= 0 || gap > expected) return expected;
  const minPlausible = Math.max(48, expected * 0.25);
  if (gap < minPlausible) return expected;
  return gap;
}

/** 页眉/页脚 DOM 是否已稳定到可参与分页（避免首帧 band 误测导致 clipHeight 过小或过大） */
export function readerPageTipChromeMeasureReady(
  frameEl: HTMLElement | null | undefined,
  tips: TextViewerPageTipsConfig,
  chromeBarsVisible: boolean,
): boolean {
  if (!frameEl || frameEl.clientHeight <= 0) return false;
  const headerVisible = readerPageTipBarVisible('header', tips, chromeBarsVisible);
  const footerVisible = readerPageTipBarVisible('footer', tips, chromeBarsVisible);
  if (!headerVisible && !footerVisible) return true;

  const frameH = frameEl.clientHeight;
  const tipBody = frameEl.querySelector<HTMLElement>('.reader-page-tip-body');
  const bodyDom = readReaderPageTipBodyClientHeightPx(tipBody);
  if (bodyDom > 0) {
    const chromeTotal = frameH - bodyDom;
    if (chromeTotal < 0 || chromeTotal > frameH * 0.65) return false;
    const minChromePx =
      (headerVisible
        ? Math.max(8, Math.floor(readerPageTipBarHeightPx('header', tips, chromeBarsVisible) * 0.35))
        : 0) +
      (footerVisible
        ? Math.max(8, Math.floor(readerPageTipBarHeightPx('footer', tips, chromeBarsVisible) * 0.35))
        : 0);
    // 页眉/页脚应占高但 tip-body 仍近满 frame：grid 尚未收缩，禁止用满高 clip 分页
    if (minChromePx > 0 && chromeTotal < minChromePx) return false;
    if (headerVisible) {
      const header = frameEl.querySelector<HTMLElement>('.reader-page-tip-header');
      if (!header || finiteOffsetHeight(header) <= 0) return false;
    }
    if (footerVisible) {
      const footer = frameEl.querySelector<HTMLElement>('.reader-page-tip-footer');
      if (!footer || finiteOffsetHeight(footer) <= 0) return false;
    }
    return true;
  }

  const pads = measureReaderPageTipChromePads(frameEl, tips, chromeBarsVisible);
  const estTop = readerPageTipBarHeightPx('header', tips, chromeBarsVisible);
  const estBottom = readerPageTipBarHeightPx('footer', tips, chromeBarsVisible);

  if (headerVisible) {
    const header = frameEl.querySelector<HTMLElement>('.reader-page-tip-header');
    if (!header || finiteOffsetHeight(header) < estTop * 0.45) return false;
    if (pads.top < estTop * 0.55 || pads.top > frameH * 0.4) return false;
  }
  if (footerVisible) {
    const footer = frameEl.querySelector<HTMLElement>('.reader-page-tip-footer');
    if (!footer || finiteOffsetHeight(footer) < estBottom * 0.45) return false;
    if (pads.bottom < estBottom * 0.55 || pads.bottom > frameH * 0.4) return false;
  }

  const bodyBudget = frameH - pads.top - pads.bottom;
  if (bodyBudget < Math.max(48, frameH * 0.35)) return false;

  if (headerVisible && footerVisible) {
    const bodyGap = measureReaderPageTipBodyHeightPx(frameEl, tips, chromeBarsVisible);
    if (bodyGap < bodyBudget * 0.88) return false;
  }
  return true;
}

/** 页眉/页脚 DOM 显隐须与 chromeBarsVisible + follow/always 逻辑一致，避免首帧未挂载就分页 */
export function readerPageTipChromeDomMatchesChromeBars(
  frameEl: HTMLElement | null | undefined,
  tips: TextViewerPageTipsConfig,
  chromeBarsVisible: boolean,
): boolean {
  const expectHeader = readerPageTipBarVisible('header', tips, chromeBarsVisible);
  const expectFooter = readerPageTipBarVisible('footer', tips, chromeBarsVisible);
  if (!expectHeader && !expectFooter) return true;
  if (!frameEl) return false;

  const headerEl = frameEl.querySelector<HTMLElement>('.reader-page-tip-header');
  const footerEl = frameEl.querySelector<HTMLElement>('.reader-page-tip-footer');
  const headerShown = headerEl != null && finiteOffsetHeight(headerEl) > 0;
  const footerShown = footerEl != null && finiteOffsetHeight(footerEl) > 0;

  if (expectHeader !== headerShown) return false;
  if (expectFooter !== footerShown) return false;
  return true;
}

/** 优先读 DOM 实测页眉/页脚高度，与分页及翻页幕帘几何对齐 */
export function measureReaderPageTipChromePads(
  frameEl: HTMLElement | null | undefined,
  tips: TextViewerPageTipsConfig,
  chromeBarsVisible: boolean,
): ReaderPageTipChromePads {
  const headerVisible = readerPageTipBarVisible('header', tips, chromeBarsVisible);
  const footerVisible = readerPageTipBarVisible('footer', tips, chromeBarsVisible);
  const estTop = readerPageTipBarHeightPx('header', tips, chromeBarsVisible);
  const estBottom = readerPageTipBarHeightPx('footer', tips, chromeBarsVisible);
  if (!frameEl) {
    return {
      top: headerVisible ? estTop : 0,
      bottom: footerVisible ? estBottom : 0,
    };
  }
  const header = frameEl.querySelector<HTMLElement>('.reader-page-tip-header');
  const footer = frameEl.querySelector<HTMLElement>('.reader-page-tip-footer');
  let top = headerVisible ? measureTipBarHeightPx(header, estTop) : 0;
  let bottom = footerVisible ? measureTipBarHeightPx(footer, estBottom) : 0;

  const tipBody = frameEl.querySelector<HTMLElement>('.reader-page-tip-body');
  const bodyDom = readReaderPageTipBodyClientHeightPx(tipBody);
  const frameH = frameEl.clientHeight;
  if (bodyDom > 0 && frameH > 0) {
    const chromeTotal = Math.max(0, frameH - bodyDom);
    if (!headerVisible && !footerVisible) {
      top = 0;
      bottom = 0;
    } else if (headerVisible && footerVisible) {
      const sum = top + bottom;
      if (sum > 0 && Math.abs(sum - chromeTotal) > 1) {
        top = Math.round(chromeTotal * (top / sum));
        bottom = chromeTotal - top;
      } else if (sum <= 0) {
        top = Math.floor(chromeTotal / 2);
        bottom = chromeTotal - top;
      }
    } else if (headerVisible) {
      top = chromeTotal;
      bottom = 0;
    } else {
      top = 0;
      bottom = chromeTotal;
    }
  }

  return {
    top: headerVisible ? top : 0,
    bottom: footerVisible ? bottom : 0,
  };
}

/**
 * 页眉/页脚之间正文区高度。
 * 优先 tip-body clientHeight（与展示裁切一致）；仅 tip-body 未挂载时回退 header/footer 间隙推算。
 */
export function measureReaderPageTipBodyHeightPx(
  frameEl: HTMLElement | null | undefined,
  tips: TextViewerPageTipsConfig,
  chromeBarsVisible: boolean,
  pageTipBodyEl?: HTMLElement | null,
): number {
  const pads = measureReaderPageTipChromePads(frameEl, tips, chromeBarsVisible);
  if (!frameEl || frameEl.clientHeight <= 0) {
    return 0;
  }
  const expected = Math.max(1, frameEl.clientHeight - pads.top - pads.bottom);

  const tipBody = resolveReaderPageTipBodyEl(frameEl, pageTipBodyEl);
  const bodyDom = readReaderPageTipBodyClientHeightPx(tipBody);
  if (bodyDom > 0) {
    return bodyDom;
  }

  const headerVisible = readerPageTipBarVisible('header', tips, chromeBarsVisible);
  const footerVisible = readerPageTipBarVisible('footer', tips, chromeBarsVisible);
  const header = frameEl.querySelector<HTMLElement>('.reader-page-tip-header');
  const footer = frameEl.querySelector<HTMLElement>('.reader-page-tip-footer');

  if (header && footer && headerVisible && footerVisible) {
    const gap = Math.floor(
      footer.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
    );
    return acceptTipBodyGapPx(gap, expected);
  }
  if (header && headerVisible && !footerVisible) {
    const gap = Math.floor(
      frameEl.getBoundingClientRect().bottom - header.getBoundingClientRect().bottom,
    );
    return acceptTipBodyGapPx(gap, expected);
  }
  if (footer && footerVisible && !headerVisible) {
    const gap = Math.floor(footer.getBoundingClientRect().top - frameEl.getBoundingClientRect().top);
    return acceptTipBodyGapPx(gap, expected);
  }
  if (!headerVisible && !footerVisible) {
    return Math.max(1, Math.round(frameEl.getBoundingClientRect().height));
  }

  return expected;
}

export function readerPageTipChromeHeightPx(
  tips: TextViewerPageTipsConfig,
  chromeBarsVisible: boolean,
): number {
  return (
    readerPageTipBarHeightPx('header', tips, chromeBarsVisible) +
    readerPageTipBarHeightPx('footer', tips, chromeBarsVisible)
  );
}

const BATTERY_TIP_TYPES: ReaderPageTipType[] = [
  'battery',
  'batteryPercentage',
  'timeBattery',
  'timeBatteryIconOnly',
  'timeBatteryPercentage',
];

const TIP_SLOT_KEYS: TipSlotKey[] = [
  'headerLeft',
  'headerMiddle',
  'headerRight',
  'footerLeft',
  'footerMiddle',
  'footerRight',
];

function tipBarHasContent(
  position: 'header' | 'footer',
  tips: TextViewerPageTipsConfig,
): boolean {
  const slots: TipSlotKey[] =
    position === 'header'
      ? ['headerLeft', 'headerMiddle', 'headerRight']
      : ['footerLeft', 'footerMiddle', 'footerRight'];
  return slots.some((s) => readerPageTipSlotValue(tips, s) !== 'none');
}

/** 仅「始终显示」的页眉/页脚随翻页幕帘与 incoming 面板一起移动 */
export function readerPageTipsCarryWithTurn(
  tips: TextViewerPageTipsConfig,
  _chromeBarsVisible: boolean,
): boolean {
  if (tips.headerMode === 'always' && tipBarHasContent('header', tips)) return true;
  if (tips.footerMode === 'always' && tipBarHasContent('footer', tips)) return true;
  return false;
}

export function readerPageTipsUseBattery(tips: TextViewerPageTipsConfig): boolean {
  return TIP_SLOT_KEYS.some((slot) =>
    BATTERY_TIP_TYPES.includes(readerPageTipSlotValue(tips, slot)),
  );
}

export function readerPageTipsUseTime(tips: TextViewerPageTipsConfig): boolean {
  const timeTypes: ReaderPageTipType[] = [
    'time',
    'timeBattery',
    'timeBatteryIconOnly',
    'timeBatteryPercentage',
  ];
  return TIP_SLOT_KEYS.some((slot) =>
    timeTypes.includes(readerPageTipSlotValue(tips, slot)),
  );
}

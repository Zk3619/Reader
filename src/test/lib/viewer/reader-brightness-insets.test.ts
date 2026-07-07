import { describe, expect, it } from 'vitest';
import {
  collectReaderBrightnessInsetWatchTargets,
  confirmReaderBrightnessChromeInsets,
  insetsNearlyEqual,
  measureReaderBrightnessChromeInsets,
  mergeReaderBrightnessChromeInsets,
  roundReaderBrightnessChromeInsets,
  stabilizeReaderBrightnessChromeInsets,
} from '@/lib/viewer/reader-brightness-insets';

function mockRect(top: number, height: number, width = 100) {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: width,
    width,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockElement(rect: DOMRect, className = ''): HTMLElement {
  return {
    classList: {
      contains: () => false,
    },
    closest: () => null,
    getBoundingClientRect: () => rect,
    className,
  } as unknown as HTMLElement;
}

function mockSlots(elements: Record<string, HTMLElement | HTMLElement[]>): HTMLElement {
  return {
    querySelectorAll: (selector: string) => {
      const hit = elements[selector];
      if (!hit) return [];
      return Array.isArray(hit) ? hit : [hit];
    },
  } as unknown as HTMLElement;
}

describe('measureReaderBrightnessChromeInsets', () => {
  const host = mockElement(mockRect(100, 500));

  it('常显页眉/页脚在顶底栏隐藏时仍计入占位', () => {
    const headerTip = mockElement(mockRect(100, 28), 'reader-page-tip-header');
    const footerTip = mockElement(mockRect(560, 40), 'reader-page-tip-footer');
    const slots = mockSlots({
      '.reader-page-tip-header': headerTip,
      '.reader-page-tip-footer': footerTip,
    });

    expect(
      measureReaderBrightnessChromeInsets(slots, host, { includeChromeBars: false }),
    ).toEqual({ top: 28, bottom: 40 });
  });

  it('跟随顶底栏的页眉/页脚计入顶栏占位', () => {
    const chromeHeaderTip = mockElement(mockRect(0, 120), 'reader-chrome-page-tip-header');
    const slots = mockSlots({
      '.reader-chrome-page-tip-header': chromeHeaderTip,
    });

    expect(
      measureReaderBrightnessChromeInsets(slots, host, { includeChromeBars: true }),
    ).toEqual({ top: 20, bottom: 0 });
  });

  it('顶底栏与常显页眉/页脚取较大占位', () => {
    const floatingTop = mockElement(mockRect(0, 88), 'reader-chrome-floating-top__track');
    const headerTip = mockElement(mockRect(100, 32), 'reader-page-tip-header');
    const footerTip = mockElement(mockRect(552, 48), 'reader-page-tip-footer');
    const slots = mockSlots({
      '.reader-chrome-floating-top__track': floatingTop,
      '.reader-page-tip-header': headerTip,
      '.reader-page-tip-footer': footerTip,
    });

    expect(
      measureReaderBrightnessChromeInsets(slots, host, { includeChromeBars: true }),
    ).toEqual({ top: 32, bottom: 48 });
  });

  it('顶栏外层 panel 占位优先于过渡中的 surface', () => {
    const host = mockElement(mockRect(0, 600));
    const outer = mockElement(mockRect(0, 120));
    const surface = mockElement(mockRect(-100, 20));
    const slots = mockSlots({
      '.reader-chrome-overlay-panel--top': outer,
      '.reader-chrome-overlay-panel--top .reader-chrome-overlay-panel__surface': surface,
    });

    expect(
      measureReaderBrightnessChromeInsets(slots, host, { includeChromeBars: true }),
    ).toEqual({ top: 120, bottom: 0 });
  });

  it('隐藏顶底栏时不计入 overlay 占位', () => {
    const hiddenSurface = {
      classList: { contains: (c: string) => c === 'reader-chrome-overlay-panel--hidden' },
      closest: (sel: string) =>
        sel === '.reader-chrome-overlay-panel'
          ? { classList: { contains: (c: string) => c === 'reader-chrome-overlay-panel--hidden' } }
          : null,
      getBoundingClientRect: () => mockRect(0, 96),
    } as unknown as HTMLElement;
    const headerTip = mockElement(mockRect(100, 24), 'reader-page-tip-header');
    const slots = mockSlots({
      '.reader-chrome-overlay-panel--top .reader-chrome-overlay-panel__surface': hiddenSurface,
      '.reader-page-tip-header': headerTip,
    });

    expect(
      measureReaderBrightnessChromeInsets(slots, host, { includeChromeBars: true }),
    ).toEqual({ top: 24, bottom: 0 });
  });
});

describe('mergeReaderBrightnessChromeInsets', () => {
  it('取各轴最大值', () => {
    expect(
      mergeReaderBrightnessChromeInsets(
        { top: 28, bottom: 40 },
        { top: 96, bottom: 32 },
      ),
    ).toEqual({ top: 96, bottom: 40 });
  });
});

describe('roundReaderBrightnessChromeInsets', () => {
  it('四舍五入到整数像素', () => {
    expect(roundReaderBrightnessChromeInsets({ top: 28.4, bottom: 39.6 })).toEqual({
      top: 28,
      bottom: 40,
    });
  });
});

describe('collectReaderBrightnessInsetWatchTargets', () => {
  it('仅收集常显页眉页脚节点', () => {
    const headerTip = { className: 'reader-page-tip-header' } as HTMLElement;
    const chromeHeaderTip = { className: 'reader-chrome-page-tip-header' } as HTMLElement;
    const slots = {
      querySelectorAll: (selector: string) => {
        if (selector === '.reader-page-tip-header') return [headerTip];
        if (selector === '.reader-chrome-page-tip-header') return [chromeHeaderTip];
        return [];
      },
    } as unknown as HTMLElement;

    expect(collectReaderBrightnessInsetWatchTargets(slots)).toEqual([headerTip]);
  });
});

describe('confirmReaderBrightnessChromeInsets', () => {
  it('首次偏差较大时先挂起，连续一致后再采纳', () => {
    const prev = { top: 80, bottom: 64 };
    const first = confirmReaderBrightnessChromeInsets(prev, { top: 96, bottom: 64 }, null);
    expect(first).toEqual({ applied: prev, pending: { top: 96, bottom: 64 } });

    const second = confirmReaderBrightnessChromeInsets(
      prev,
      { top: 96, bottom: 64 },
      first.pending,
    );
    expect(second).toEqual({ applied: { top: 96, bottom: 64 }, pending: null });
  });

  it('亚像素抖动不更新', () => {
    const prev = { top: 80, bottom: 64 };
    expect(
      confirmReaderBrightnessChromeInsets(prev, { top: 82, bottom: 65 }, null),
    ).toEqual({ applied: prev, pending: null });
  });
});

describe('insetsNearlyEqual', () => {
  it('小于阈值视为相等', () => {
    expect(insetsNearlyEqual({ top: 80, bottom: 64 }, { top: 83, bottom: 67 })).toBe(true);
  });
});

describe('stabilizeReaderBrightnessChromeInsets', () => {
  it('小于阈值的抖动保持原值', () => {
    const prev = { top: 80, bottom: 64 };
    expect(stabilizeReaderBrightnessChromeInsets(prev, { top: 81, bottom: 65 })).toEqual(prev);
  });

  it('超过阈值时采用新值', () => {
    const prev = { top: 80, bottom: 64 };
    expect(stabilizeReaderBrightnessChromeInsets(prev, { top: 84, bottom: 64 })).toEqual({
      top: 84,
      bottom: 64,
    });
  });
});

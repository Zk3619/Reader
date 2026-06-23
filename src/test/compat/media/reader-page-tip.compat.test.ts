import { describe, expect, it } from 'vitest';
import {
  measureReaderPageTipChromePads,
  measureReaderPageTipBodyHeightPx,
  readerPageTipBarHeightPx,
  readerPageTipBarVisible,
  readReaderPageTipBodyClientHeightPx,
  readerPageTipChromeDomMatchesChromeBars,
  readerPageTipChromeMeasureReady,
  readerPageTipContentBudget,
  readerPageTipsCarryWithTurn,
} from '@/lib/media/text/reader-page-tip';
import { defaultTextViewerPageTipsConfig } from '@/lib/media/text/reader-ui-config';

const tipsWithHeaderSlots = {
  ...defaultTextViewerPageTipsConfig,
  headerLeft: 'time' as const,
  headerRight: 'battery' as const,
};

describe('readerPageTipBarVisible follow chrome', () => {
  it('shows header/footer when chrome visible in follow mode', () => {
    const tips = { ...tipsWithHeaderSlots, headerMode: 'follow' as const, footerMode: 'follow' as const };
    expect(readerPageTipBarVisible('header', tips, true)).toBe(true);
    expect(readerPageTipBarVisible('footer', tips, true)).toBe(true);
  });

  it('hides header/footer when chrome hidden in follow mode', () => {
    const tips = { ...tipsWithHeaderSlots, headerMode: 'follow' as const, footerMode: 'follow' as const };
    expect(readerPageTipBarVisible('header', tips, false)).toBe(false);
    expect(readerPageTipBarVisible('footer', tips, false)).toBe(false);
  });

  it('always mode ignores chrome visibility', () => {
    const tips = { ...tipsWithHeaderSlots, headerMode: 'always' as const };
    expect(readerPageTipBarVisible('header', tips, false)).toBe(true);
    expect(readerPageTipBarVisible('header', tips, true)).toBe(true);
  });
});

describe('measureReaderPageTipChromePads', () => {
  it('uses estimated footer height when bar should be visible but DOM not mounted', () => {
    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'always' as const,
      footerMode: 'always' as const,
      footerRight: 'page' as const,
    };
    const est = readerPageTipBarHeightPx('footer', tips, false);
    expect(est).toBeGreaterThan(0);
    const pads = measureReaderPageTipChromePads(null, tips, false);
    expect(pads.bottom).toBe(est);
    expect(pads.top).toBeGreaterThan(0);
  });
});

describe('measureReaderPageTipBodyHeightPx', () => {
  it('uses gap between header bottom and footer top', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const header = {
      offsetHeight: 30,
      getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
    } as HTMLElement;
    const footer = {
      offsetHeight: 40,
      getBoundingClientRect: () => ({ top: 560, bottom: 600, height: 40 }),
    } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return header;
      if (sel === '.reader-page-tip-footer') return footer;
      return null;
    };

    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'always' as const,
      footerMode: 'always' as const,
      footerRight: 'page' as const,
    };
    expect(measureReaderPageTipBodyHeightPx(frame, tips, false)).toBe(530);
  });

  it('prefers tip-body clientHeight over header-footer rect gap', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const header = {
      offsetHeight: 30,
      getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
    } as HTMLElement;
    const footer = {
      offsetHeight: 40,
      getBoundingClientRect: () => ({ top: 560, bottom: 600, height: 40 }),
    } as HTMLElement;
    const tipBody = { clientHeight: 526 } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return header;
      if (sel === '.reader-page-tip-footer') return footer;
      if (sel === '.reader-page-tip-body') return tipBody;
      return null;
    };

    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'always' as const,
      footerMode: 'always' as const,
      footerRight: 'page' as const,
    };
    expect(measureReaderPageTipBodyHeightPx(frame, tips, false)).toBe(526);
    expect(readReaderPageTipBodyClientHeightPx(tipBody)).toBe(526);
  });

  it('falls back to frame minus pads when rect gap is implausible', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const header = {
      offsetHeight: 24,
      getBoundingClientRect: () => ({ top: 0, bottom: 24, height: 24 }),
    } as HTMLElement;
    const footer = {
      offsetHeight: 20,
      getBoundingClientRect: () => ({ top: 40, bottom: 60, height: 20 }),
    } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return header;
      if (sel === '.reader-page-tip-footer') return footer;
      return null;
    };

    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'always' as const,
      footerMode: 'always' as const,
      footerRight: 'page' as const,
    };
    // gap=16 too small vs expected ~556 → use expected
    const h = measureReaderPageTipBodyHeightPx(frame, tips, false);
    expect(h).toBeGreaterThan(500);
    expect(h).toBeLessThanOrEqual(600);
  });

  it('prefers DOM gap when footer pad is underestimated', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const header = {
      offsetHeight: 30,
      getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
    } as HTMLElement;
    const footer = {
      offsetHeight: 50,
      getBoundingClientRect: () => ({ top: 520, bottom: 600, height: 80 }),
    } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return header;
      if (sel === '.reader-page-tip-footer') return footer;
      return null;
    };

    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'always' as const,
      footerMode: 'always' as const,
      footerRight: 'page' as const,
    };
    expect(measureReaderPageTipBodyHeightPx(frame, tips, false)).toBe(490);
  });
});

describe('readerPageTipContentBudget', () => {
  it('expands body when tips hidden', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
      querySelector: () => null,
    } as unknown as HTMLElement;
    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'never' as const,
      footerMode: 'never' as const,
    };
    const budget = readerPageTipContentBudget(frame, tips, true);
    expect(budget.headerPad).toBe(0);
    expect(budget.footerPad).toBe(0);
    expect(budget.bodyHeightPx).toBe(600);
  });

  it('shrinks body between visible header and footer', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const header = {
      offsetHeight: 30,
      getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
    } as HTMLElement;
    const footer = {
      offsetHeight: 40,
      getBoundingClientRect: () => ({ top: 560, bottom: 600, height: 40 }),
    } as HTMLElement;
    const tipBody = { clientHeight: 530 } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return header;
      if (sel === '.reader-page-tip-footer') return footer;
      return null;
    };

    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'always' as const,
      footerMode: 'always' as const,
      footerRight: 'page' as const,
    };
    const budget = readerPageTipContentBudget(frame, tips, false, tipBody);
    expect(budget.headerPad).toBeGreaterThan(0);
    expect(budget.footerPad).toBeGreaterThan(0);
    expect(budget.bodyHeightPx).toBe(530);
    expect(budget.bodyHeightPx).toBeLessThan(600);
  });

  it('does not shrink body below tip-body DOM when footer is visible', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const header = {
      offsetHeight: 30,
      getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
    } as HTMLElement;
    const footer = {
      offsetHeight: 40,
      getBoundingClientRect: () => ({ top: 560, bottom: 600, height: 40 }),
    } as HTMLElement;
    const tipBody = { clientHeight: 530 } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return header;
      if (sel === '.reader-page-tip-footer') return footer;
      return null;
    };

    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'always' as const,
      footerMode: 'always' as const,
      footerRight: 'page' as const,
      showFooterLine: true,
    };
    const budget = readerPageTipContentBudget(frame, tips, false, tipBody);
    expect(budget.bodyHeightPx).toBe(530);
  });

  it('tip-body DOM wins over inflated chrome pad estimates', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const header = {
      offsetHeight: 28,
      getBoundingClientRect: () => ({ top: 0, bottom: 28, height: 28 }),
    } as HTMLElement;
    const footer = {
      offsetHeight: 36,
      getBoundingClientRect: () => ({ top: 564, bottom: 600, height: 36 }),
    } as HTMLElement;
    const tipBody = { clientHeight: 536 } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return header;
      if (sel === '.reader-page-tip-footer') return footer;
      if (sel === '.reader-page-tip-body') return tipBody;
      return null;
    };

    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'always' as const,
      footerMode: 'always' as const,
      footerRight: 'page' as const,
      headerInset: { top: 12, bottom: 12, left: 8, right: 8 },
      footerInset: { top: 12, bottom: 12, left: 8, right: 8 },
      showHeaderLine: true,
      showFooterLine: true,
    };
    const budget = readerPageTipContentBudget(frame, tips, false, tipBody);
    expect(budget.bodyHeightPx).toBe(536);
    expect(budget.headerPad + budget.footerPad + budget.bodyHeightPx).toBe(600);
  });
});

describe('readerPageTipChromeMeasureReady', () => {
  it('waits for footer DOM before measuring when footer visible', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
      querySelector: () => null,
    } as unknown as HTMLElement;
    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'always' as const,
      footerMode: 'always' as const,
      footerRight: 'page' as const,
    };
    expect(readerPageTipChromeMeasureReady(frame, tips, false)).toBe(false);
  });

  it('returns true when header/footer DOM and gap are stable', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const header = {
      offsetHeight: 30,
      getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
    } as HTMLElement;
    const footer = {
      offsetHeight: 40,
      getBoundingClientRect: () => ({ top: 560, bottom: 600, height: 40 }),
    } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return header;
      if (sel === '.reader-page-tip-footer') return footer;
      return null;
    };

    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'always' as const,
      footerMode: 'always' as const,
      footerRight: 'page' as const,
    };
    expect(readerPageTipChromeMeasureReady(frame, tips, false)).toBe(true);
  });

  it('returns true when tip-body is laid out even if bars are shorter than estimate', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const header = {
      offsetHeight: 22,
      getBoundingClientRect: () => ({ top: 0, bottom: 22, height: 22 }),
    } as HTMLElement;
    const footer = {
      offsetHeight: 20,
      getBoundingClientRect: () => ({ top: 580, bottom: 600, height: 20 }),
    } as HTMLElement;
    const tipBody = { clientHeight: 558 } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return header;
      if (sel === '.reader-page-tip-footer') return footer;
      if (sel === '.reader-page-tip-body') return tipBody;
      return null;
    };

    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'always' as const,
      footerMode: 'always' as const,
      footerRight: 'page' as const,
      headerInset: { top: 16, bottom: 16, left: 8, right: 8 },
      footerInset: { top: 16, bottom: 16, left: 8, right: 8 },
      showHeaderLine: true,
      showFooterLine: true,
    };
    expect(readerPageTipChromeMeasureReady(frame, tips, false)).toBe(true);
  });

  it('rejects when header mounted but tip-body still full frame height', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const header = {
      offsetHeight: 28,
      getBoundingClientRect: () => ({ top: 0, bottom: 28, height: 28 }),
    } as HTMLElement;
    const tipBody = { clientHeight: 600 } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return header;
      if (sel === '.reader-page-tip-footer') return null;
      if (sel === '.reader-page-tip-body') return tipBody;
      return null;
    };

    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'follow' as const,
      footerMode: 'never' as const,
    };
    expect(readerPageTipChromeMeasureReady(frame, tips, true)).toBe(false);
  });
});

describe('readerPageTipChromeDomMatchesChromeBars', () => {
  it('passes when follow header visible regardless of tip-body shrink', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const header = { offsetHeight: 28 } as HTMLElement;
    const tipBody = { clientHeight: 600 } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return header;
      if (sel === '.reader-page-tip-footer') return null;
      if (sel === '.reader-page-tip-body') return tipBody;
      return null;
    };
    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'follow' as const,
      footerMode: 'never' as const,
    };
    expect(readerPageTipChromeDomMatchesChromeBars(frame, tips, true)).toBe(true);
    expect(readerPageTipChromeMeasureReady(frame, tips, true)).toBe(false);
  });

  it('passes when follow header visible and tip-body shrunk', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const header = { offsetHeight: 28 } as HTMLElement;
    const tipBody = { clientHeight: 572 } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return header;
      if (sel === '.reader-page-tip-footer') return null;
      if (sel === '.reader-page-tip-body') return tipBody;
      return null;
    };
    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'follow' as const,
      footerMode: 'never' as const,
    };
    expect(readerPageTipChromeDomMatchesChromeBars(frame, tips, true)).toBe(true);
  });

  it('passes when follow chrome hidden and header absent', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const tipBody = { clientHeight: 600 } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return null;
      if (sel === '.reader-page-tip-footer') return null;
      if (sel === '.reader-page-tip-body') return tipBody;
      return null;
    };
    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'follow' as const,
      footerMode: 'never' as const,
    };
    expect(readerPageTipChromeDomMatchesChromeBars(frame, tips, false)).toBe(true);
  });

  it('fails when chrome visible but header not in DOM', () => {
    const frame = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
    } as HTMLElement;
    const tipBody = { clientHeight: 600 } as HTMLElement;
    frame.querySelector = (sel: string) => {
      if (sel === '.reader-page-tip-header') return null;
      if (sel === '.reader-page-tip-footer') return null;
      if (sel === '.reader-page-tip-body') return tipBody;
      return null;
    };
    const tips = {
      ...tipsWithHeaderSlots,
      headerMode: 'follow' as const,
      footerMode: 'never' as const,
    };
    expect(readerPageTipChromeDomMatchesChromeBars(frame, tips, true)).toBe(false);
  });
});

describe('readerPageTipsCarryWithTurn', () => {
  it('carries only when always mode has slot content', () => {
    const tips = { ...tipsWithHeaderSlots, headerMode: 'always' as const, footerMode: 'follow' as const };
    expect(readerPageTipsCarryWithTurn(tips, true)).toBe(true);
    expect(readerPageTipsCarryWithTurn(tips, false)).toBe(true);
  });

  it('does not carry in follow mode even when tips visible', () => {
    const tips = { ...tipsWithHeaderSlots, headerMode: 'follow' as const, footerMode: 'follow' as const };
    expect(readerPageTipsCarryWithTurn(tips, true)).toBe(false);
  });
});

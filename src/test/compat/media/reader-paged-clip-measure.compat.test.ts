import { describe, expect, it, vi } from 'vitest';
import {
  measureContentSlotInsets,
  measurePagedClipContentHeight,
  outerViewportHeightFromClipContent,
  readPagedPageWindowMetrics,
  readPagedSpreadContentWidthPx,
} from '@/lib/media/text/reader-paged-clip-measure';
import { TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX, TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX } from '@/lib/media/text/reader-ui-config';

describe('measureContentSlotInsets', () => {
  it('uses config fallback when slot missing', () => {
    expect(measureContentSlotInsets(null)).toEqual({
      top: TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX,
      bottom: TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX,
      left: 16,
      right: 16,
    });
  });

  it('reads explicit zero insets on frame without falling back to defaults', () => {
    const el = {} as HTMLElement;
    const getComputedStyle = vi.fn(() => ({
      top: '0px',
      bottom: '0px',
      left: '16px',
      right: '16px',
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
    }));
    vi.stubGlobal('getComputedStyle', getComputedStyle);

    expect(
      measureContentSlotInsets(el, {
        top: 32,
        bottom: 32,
        left: 16,
        right: 16,
      }),
    ).toEqual({
      top: 0,
      bottom: 0,
      left: 16,
      right: 16,
    });

    vi.unstubAllGlobals();
  });

  it('reads horizontal padding insets when frame is full bleed (slide panel)', () => {
    const el = {} as HTMLElement;
    const getComputedStyle = vi.fn(() => ({
      top: '0px',
      bottom: '0px',
      left: '0px',
      right: '0px',
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '16px',
      paddingRight: '16px',
    }));
    vi.stubGlobal('getComputedStyle', getComputedStyle);

    expect(measureContentSlotInsets(el)).toEqual({
      top: 0,
      bottom: 0,
      left: 16,
      right: 16,
    });

    vi.unstubAllGlobals();
  });
});

describe('readPagedPageWindowMetrics', () => {
  it('derives clipHeight from viewport minus insets without slot', () => {
    const metrics = readPagedPageWindowMetrics({
      viewportEl: { clientHeight: 781 } as HTMLElement,
    });
    expect(metrics.clipHeight).toBe(
      781 - TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX - TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX,
    );
    expect(metrics.viewportHeight).toBe(781);
  });

  it('reads insets from content-frame while clip height follows inner slot', () => {
    const frame = {} as HTMLElement;
    const slot = {
      clientHeight: 420,
      style: { paddingTop: '0px', paddingBottom: '0px' },
    } as HTMLElement;
    const getComputedStyle = vi.fn(() => ({
      top: '32px',
      bottom: '32px',
      left: '16px',
      right: '16px',
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
    }));
    vi.stubGlobal('getComputedStyle', getComputedStyle);

    const metrics = readPagedPageWindowMetrics({
      viewportEl: { clientHeight: 600 } as HTMLElement,
      contentFrameEl: frame,
      contentSlotEl: slot,
      fallbackInsets: { top: 32, bottom: 32, left: 16, right: 16 },
    });
    expect(metrics.clipHeight).toBe(420);
    expect(metrics.padTop).toBe(32);
    expect(metrics.padBottom).toBe(32);
    expect(metrics.viewportHeight).toBe(420 + 32 + 32);

    vi.unstubAllGlobals();
  });

  it('full-bleed frame uses tip chrome pads and viewport outer height', () => {
    const frame = { clientHeight: 600 } as HTMLElement;
    const slot = {
      clientHeight: 500,
      style: { paddingTop: '0px', paddingBottom: '0px' },
    } as HTMLElement;
    const getComputedStyle = vi.fn(() => ({
      top: '0px',
      bottom: '0px',
      left: '16px',
      right: '16px',
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
    }));
    vi.stubGlobal('getComputedStyle', getComputedStyle);

    const metrics = readPagedPageWindowMetrics({
      viewportEl: { clientHeight: 600 } as HTMLElement,
      contentFrameEl: frame,
      contentSlotEl: slot,
      fallbackInsets: { top: 0, bottom: 0, left: 16, right: 16 },
      tipChromePadTop: 24,
      tipChromePadBottom: 20,
    });
    expect(metrics.clipHeight).toBe(556);
    expect(metrics.padTop).toBe(24);
    expect(metrics.padBottom).toBe(20);
    expect(metrics.viewportHeight).toBe(600);

    vi.unstubAllGlobals();
  });

  it('uses tip-body DOM height when grid body is measured', () => {
    const frame = { clientHeight: 600 } as HTMLElement;
    const slot = {
      clientHeight: 580,
      style: { paddingTop: '0px', paddingBottom: '0px' },
    } as HTMLElement;
    const tipBody = { clientHeight: 556 } as HTMLElement;
    const getComputedStyle = vi.fn(() => ({
      top: '0px',
      bottom: '0px',
      left: '16px',
      right: '16px',
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
    }));
    vi.stubGlobal('getComputedStyle', getComputedStyle);

    const metrics = readPagedPageWindowMetrics({
      viewportEl: { clientHeight: 600 } as HTMLElement,
      contentFrameEl: frame,
      contentSlotEl: slot,
      pageTipBodyEl: tipBody,
      fallbackInsets: { top: 0, bottom: 0, left: 16, right: 16 },
      tipChromePadTop: 24,
      tipChromePadBottom: 20,
    });
    expect(metrics.clipHeight).toBe(556);

    vi.unstubAllGlobals();
  });

  it('subtracts content-slot vertical padding from tip-body clip height', () => {
    const frame = { clientHeight: 600 } as HTMLElement;
    const slot = {
      clientHeight: 556,
      style: { paddingTop: '32px', paddingBottom: '32px' },
    } as HTMLElement;
    const tipBody = { clientHeight: 556 } as HTMLElement;
    const getComputedStyle = vi.fn(() => ({
      top: '0px',
      bottom: '0px',
      left: '16px',
      right: '16px',
      paddingTop: '32px',
      paddingBottom: '32px',
      paddingLeft: '0px',
      paddingRight: '0px',
    }));
    vi.stubGlobal('getComputedStyle', getComputedStyle);

    const metrics = readPagedPageWindowMetrics({
      viewportEl: { clientHeight: 600 } as HTMLElement,
      contentFrameEl: frame,
      contentSlotEl: slot,
      pageTipBodyEl: tipBody,
      fallbackInsets: { top: 0, bottom: 0, left: 16, right: 16 },
      tipChromePadTop: 24,
      tipChromePadBottom: 20,
    });
    expect(metrics.clipHeight).toBe(492);

    vi.unstubAllGlobals();
  });

  it('prefers authoritative body height over inflated slot measurement', () => {
    const frame = { clientHeight: 600 } as HTMLElement;
    const slot = {
      clientHeight: 580,
      style: { paddingTop: '0px', paddingBottom: '0px' },
    } as HTMLElement;
    const getComputedStyle = vi.fn(() => ({
      top: '0px',
      bottom: '0px',
      left: '0px',
      right: '0px',
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
    }));
    vi.stubGlobal('getComputedStyle', getComputedStyle);

    const metrics = readPagedPageWindowMetrics({
      viewportEl: { clientHeight: 600 } as HTMLElement,
      contentFrameEl: frame,
      contentSlotEl: slot,
      fallbackInsets: { top: 0, bottom: 0, left: 16, right: 16 },
      tipChromePadTop: 24,
      tipChromePadBottom: 20,
      authoritativeBodyHeightPx: 540,
    });
    expect(metrics.clipHeight).toBe(540);

    vi.unstubAllGlobals();
  });
});

describe('measurePagedClipContentHeight', () => {
  it('uses fallback when clip element missing', () => {
    expect(measurePagedClipContentHeight(null, 800)).toBe(
      800 - TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX - TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX,
    );
  });

  it('uses content-slot clientHeight when slide panel has only horizontal padding', () => {
    const slot = {
      clientHeight: 600,
      style: { paddingTop: '0px', paddingBottom: '0px' },
    } as HTMLElement;
    expect(measurePagedClipContentHeight(null, 781, undefined, slot)).toBe(600);
  });

  it('uses content-slot clientHeight directly when padding is zero (paged mount)', () => {
    const slot = {
      clientHeight: 466,
      style: { paddingTop: '0px', paddingBottom: '0px' },
    } as HTMLElement;
    expect(measurePagedClipContentHeight(null, 800, undefined, slot)).toBe(466);
  });

  it('page tip chrome as sibling must not change measured clip height', () => {
    const slot = {
      clientHeight: 466,
      style: { paddingTop: '0px', paddingBottom: '0px' },
    } as HTMLElement;
    const clipWithTipSibling = { clientHeight: 500 } as HTMLElement;
    const fromSlot = measurePagedClipContentHeight(clipWithTipSibling, 781, undefined, slot);
    const fromSlotOnly = measurePagedClipContentHeight(null, 781, undefined, slot);
    expect(fromSlot).toBe(fromSlotOnly);
    expect(fromSlot).toBe(466);
  });

  it('subtracts tip chrome height from fallback when frame is full bleed', () => {
    expect(
      measurePagedClipContentHeight(null, 600, { top: 0, bottom: 0 }, null, {
        top: 24,
        bottom: 20,
      }),
    ).toBe(556);
  });

  it('caps slot height to viewport minus tip chrome', () => {
    const slot = {
      clientHeight: 620,
      style: { paddingTop: '0px', paddingBottom: '0px' },
    } as HTMLElement;
    expect(
      measurePagedClipContentHeight(null, 600, { top: 0, bottom: 0 }, slot, {
        top: 24,
        bottom: 20,
      }),
    ).toBe(556);
  });

  it('prefers page-tip-body height over content-slot when provided', () => {
    const slot = {
      clientHeight: 620,
      style: { paddingTop: '0px', paddingBottom: '0px' },
    } as HTMLElement;
    const tipBody = { clientHeight: 540 } as HTMLElement;
    expect(
      measurePagedClipContentHeight(null, 600, { top: 0, bottom: 0 }, slot, {
        top: 24,
        bottom: 20,
      }, tipBody),
    ).toBe(540);
  });

  it('subtracts content-slot vertical padding from tip-body clip height', () => {
    const slot = {
      clientHeight: 540,
      style: { paddingTop: '32px', paddingBottom: '32px' },
    } as HTMLElement;
    const tipBody = { clientHeight: 540 } as HTMLElement;
    expect(
      measurePagedClipContentHeight(null, 600, { top: 0, bottom: 0 }, slot, undefined, tipBody),
    ).toBe(476);
  });
});

describe('outerViewportHeightFromClipContent', () => {
  it('adds content insets back', () => {
    expect(outerViewportHeightFromClipContent(466)).toBe(
      466 + TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX + TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX,
    );
  });
});

describe('readPagedSpreadContentWidthPx', () => {
  it('uses viewport minus insets instead of inflated slot width', () => {
    const width = readPagedSpreadContentWidthPx({
      viewportEl: { clientWidth: 1280 } as HTMLElement,
      contentSlotEl: null,
      fallbackInsets: { top: 32, bottom: 32, left: 16, right: 16 },
    });
    expect(width).toBe(1280 - 16 - 16);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  measureContentSlotInsets,
  measurePagedClipContentHeight,
  outerViewportHeightFromClipContent,
  readPagedPageWindowMetrics,
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

  it('reads padding insets when absolute position is zero (slide panel)', () => {
    const el = {} as HTMLElement;
    const getComputedStyle = vi.fn(() => ({
      top: '0px',
      bottom: '0px',
      left: '0px',
      right: '0px',
      paddingTop: `${TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX}px`,
      paddingBottom: `${TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX}px`,
      paddingLeft: '16px',
      paddingRight: '16px',
    }));
    vi.stubGlobal('getComputedStyle', getComputedStyle);

    expect(measureContentSlotInsets(el)).toEqual({
      top: TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX,
      bottom: TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX,
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
});

describe('measurePagedClipContentHeight', () => {
  it('uses fallback when clip element missing', () => {
    expect(measurePagedClipContentHeight(null, 800)).toBe(
      800 - TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX - TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX,
    );
  });
});

describe('outerViewportHeightFromClipContent', () => {
  it('adds content insets back', () => {
    expect(outerViewportHeightFromClipContent(466)).toBe(
      466 + TEXT_VIEWER_PAGED_CONTENT_INSET_TOP_PX + TEXT_VIEWER_PAGED_CONTENT_INSET_BOTTOM_PX,
    );
  });
});

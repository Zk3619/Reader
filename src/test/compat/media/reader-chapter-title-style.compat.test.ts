import { describe, expect, it } from 'vitest';
import { readerChapterTitleSpacingPx } from '@/lib/media/text/reader-chapter-title-style';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

const baseConfig = defaultTextViewerUiConfig;

describe('readerChapterTitleSpacingPx alignment parity', () => {
  it('uses the same vertical spacing for left, center, and right in paged mode', () => {
    const left = readerChapterTitleSpacingPx('left', baseConfig, 'paged');
    const center = readerChapterTitleSpacingPx('center', baseConfig, 'paged');
    const right = readerChapterTitleSpacingPx('right', baseConfig, 'paged');

    expect(left).not.toBeNull();
    expect(center).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left!.marginTopPx).toBe(center!.marginTopPx);
    expect(left!.marginBottomPx).toBe(center!.marginBottomPx);
    expect(right!.marginTopPx).toBe(center!.marginTopPx);
    expect(right!.marginBottomPx).toBe(center!.marginBottomPx);
  });

  it('uses the same vertical spacing for left, center, and right in scroll mode', () => {
    const left = readerChapterTitleSpacingPx('left', baseConfig, 'scroll');
    const center = readerChapterTitleSpacingPx('center', baseConfig, 'scroll');
    const right = readerChapterTitleSpacingPx('right', baseConfig, 'scroll');

    expect(left!.marginTopPx).toBe(center!.marginTopPx);
    expect(left!.marginBottomPx).toBe(center!.marginBottomPx);
    expect(right!.marginTopPx).toBe(center!.marginTopPx);
    expect(right!.marginBottomPx).toBe(center!.marginBottomPx);
  });
});

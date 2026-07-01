import { describe, expect, it } from 'vitest';
import {
  canStartReaderTextLongPressForChrome,
  shouldDismissChromeOverRegionalClick,
  viewerChromeBarsCollapsible,
} from '@/lib/media/viewer-regional-click';

describe('viewer regional click chrome dismiss', () => {
  it('fixed layout keeps regional click when bars visible', () => {
    expect(viewerChromeBarsCollapsible('fixed')).toBe(false);
    expect(shouldDismissChromeOverRegionalClick(true, false)).toBe(false);
  });

  it('collapsible layout dismisses chrome instead of regional click when bars visible', () => {
    expect(viewerChromeBarsCollapsible('stacked')).toBe(true);
    expect(shouldDismissChromeOverRegionalClick(true, true)).toBe(true);
  });

  it('collapsible layout allows regional click when bars hidden', () => {
    expect(shouldDismissChromeOverRegionalClick(false, true)).toBe(false);
  });

  it('fixed layout allows long press while chrome appears visible', () => {
    expect(canStartReaderTextLongPressForChrome(true, 'fixed')).toBe(true);
  });

  it('collapsible layout requires hidden chrome before long press', () => {
    expect(canStartReaderTextLongPressForChrome(true, 'stacked')).toBe(false);
    expect(canStartReaderTextLongPressForChrome(false, 'stacked')).toBe(true);
  });
});

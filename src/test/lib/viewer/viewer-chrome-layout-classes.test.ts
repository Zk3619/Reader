import { describe, expect, it } from 'vitest';
import {
  mediaViewerChromeBottomContentClass,
  mediaViewerChromeBottomPrimarySectionClass,
  mediaViewerChromeBottomRowClass,
  mediaViewerChromeDesktopMinWidthClass,
  mediaViewerChromeFloatingActionsClusterClass,
  mediaViewerChromeFloatingActionsClusterScrollClass,
  mediaViewerChromeFloatingBottomPillClass,
  mediaViewerChromeFloatingBottomRowClass,
  mediaViewerChromeFloatingOverlayFirstRowClass,
  mediaViewerChromeFloatingSliderPillClass,
  mediaViewerChromeFloatingStatusPillClass,
  mediaViewerChromeFloatingToolbarRowClass,
  mediaViewerChromeFloatingWideBlockClass,
  mediaViewerChromeFloatingTitleCapsuleClass,
  mediaViewerChromeFloatingIconButtonClass,
  mediaViewerChromeFloatingToolbarLeadRowClass,
  mediaViewerChromeFloatingWindowChromeCapsuleClass,
  mediaViewerChromeFloatingWindowChromeLeadClass,
  mediaViewerChromeFloatingWindowChromeTrailClass,
  mediaViewerChromeToolbarRowStackedClass,
  mediaViewerChromeToolbarActionsGroupClass,
  mediaViewerChromeToolbarActionsMobileClass,
  mediaViewerChromeToolbarLeadRowClass,
  mediaViewerChromeToolbarOverlayFirstRowClass,
  mediaViewerChromeToolbarPrimaryActionsClass,
  mediaViewerChromeToolbarRowClass,
  mediaViewerChromeToolbarRowMobileClass,
  mediaViewerChromeToolbarSpacerClass,
  mediaViewerChromeToolbarTitleClass,
  mediaViewerChromeToolbarTitleInlineClass,
  mediaViewerChromeToolbarWindowChromeLeadClass,
  mediaViewerChromeToolbarWindowChromeTrailClass,
  VIEWER_CHROME_BREAKPOINT_COMPACT_PX,
  VIEWER_CHROME_BREAKPOINT_TOOLBAR_PRIMARY_PX,
  VIEWER_CHROME_BREAKPOINT_SINGLE_ROW_PX,
  VIEWER_CHROME_DESKTOP_MIN_WIDTH_PX,
} from '@/components/viewer/viewer-chrome';

describe('viewer-chrome layout classes', () => {
  it('documents breakpoint constants', () => {
    expect(VIEWER_CHROME_BREAKPOINT_COMPACT_PX).toBe(360);
    expect(VIEWER_CHROME_BREAKPOINT_TOOLBAR_PRIMARY_PX).toBe(480);
    expect(VIEWER_CHROME_BREAKPOINT_SINGLE_ROW_PX).toBe(640);
    expect(VIEWER_CHROME_DESKTOP_MIN_WIDTH_PX).toBe(240);
    expect(mediaViewerChromeDesktopMinWidthClass).toContain('240px');
  });

  it('toolbar row wraps below 360px and between 480px and sm', () => {
    expect(mediaViewerChromeToolbarRowClass).toContain('max-[359px]:flex-wrap');
    expect(mediaViewerChromeToolbarRowClass).toContain('min-[480px]:max-sm:flex-wrap');
  });

  it('wide-screen lead row does not flex-grow; title area is capped', () => {
    expect(mediaViewerChromeToolbarLeadRowClass).toContain('sm:flex-none');
    expect(mediaViewerChromeToolbarLeadRowClass).toContain('sm:max-w-');
    expect(mediaViewerChromeToolbarActionsGroupClass).toContain('sm:flex-none');
    expect(mediaViewerChromeToolbarActionsGroupClass).not.toContain('sm:flex-1');
  });

  it('toolbar actions group uses 480px second-row breakpoint', () => {
    expect(mediaViewerChromeToolbarActionsGroupClass).toContain('min-[480px]:max-sm:basis-full');
    expect(mediaViewerChromeToolbarActionsGroupClass).toContain('max-[359px]:basis-full');
  });

  it('mobile toolbar row stays single line', () => {
    expect(mediaViewerChromeToolbarRowMobileClass).toContain('h-14');
    expect(mediaViewerChromeToolbarRowMobileClass).not.toContain('flex-wrap');
  });

  it('mobile toolbar actions align to the right', () => {
    expect(mediaViewerChromeToolbarActionsMobileClass).toContain('ml-auto');
    expect(mediaViewerChromeToolbarActionsMobileClass).toContain('overflow-x-auto');
  });

  it('primary toolbar actions use min-[480px] breakpoint', () => {
    expect(mediaViewerChromeToolbarPrimaryActionsClass).toContain('min-[480px]:contents');
    expect(mediaViewerChromeToolbarPrimaryActionsClass).toContain('hidden');
  });

  it('bottom primary section hides at min-[480px] on desktop', () => {
    expect(mediaViewerChromeBottomPrimarySectionClass).toContain('min-[480px]:hidden');
  });

  it('toolbar spacer shows only on sm+ single-row layout', () => {
    expect(mediaViewerChromeToolbarSpacerClass).toContain('hidden');
    expect(mediaViewerChromeToolbarSpacerClass).toContain('sm:block');
  });

  it('bottom chrome rows stay within viewport width', () => {
    expect(mediaViewerChromeBottomRowClass).toContain('max-w-full');
    expect(mediaViewerChromeBottomContentClass).toContain('min-w-0');
  });

  it('floating toolbar row wraps below 480px (unlike stacked 360-479 single row)', () => {
    expect(mediaViewerChromeFloatingToolbarRowClass).not.toBe(
      mediaViewerChromeToolbarRowStackedClass,
    );
    expect(mediaViewerChromeFloatingToolbarRowClass).toContain('max-[479px]:flex-wrap');
    expect(mediaViewerChromeFloatingToolbarRowClass).toContain('min-[480px]:max-sm:flex-wrap');
    expect(mediaViewerChromeFloatingToolbarRowClass).toContain('overflow-visible');
    expect(mediaViewerChromeFloatingToolbarRowClass).not.toContain('overflow-x-auto');
    expect(mediaViewerChromeFloatingToolbarRowClass).not.toContain('min-[360px]:max-[479px]:contents');
  });

  it('floating overlay first row stays independent below sm', () => {
    expect(mediaViewerChromeFloatingOverlayFirstRowClass).toContain('max-[479px]:basis-full');
    expect(mediaViewerChromeFloatingOverlayFirstRowClass).toContain('min-[480px]:max-sm:basis-full');
    expect(mediaViewerChromeFloatingOverlayFirstRowClass).toContain('sm:contents');
    expect(mediaViewerChromeFloatingOverlayFirstRowClass).not.toContain('min-[360px]:max-[479px]:contents');
  });

  it('floating window chrome trail only shows on sm+ to avoid third-row duplicate', () => {
    expect(mediaViewerChromeFloatingWindowChromeLeadClass).toContain('max-sm:flex');
    expect(mediaViewerChromeFloatingWindowChromeLeadClass).toContain('sm:hidden');
    expect(mediaViewerChromeFloatingWindowChromeTrailClass).toContain('hidden');
    expect(mediaViewerChromeFloatingWindowChromeTrailClass).toContain('sm:flex');
    expect(mediaViewerChromeFloatingWindowChromeTrailClass).toContain('sm:ml-auto');
    expect(mediaViewerChromeFloatingWindowChromeTrailClass).not.toContain('min-[360px]');
  });

  it('floating lead row grows on sm+ so title can use remaining width', () => {
    expect(mediaViewerChromeFloatingToolbarLeadRowClass).toContain('sm:flex-1');
    expect(mediaViewerChromeFloatingToolbarLeadRowClass).not.toContain('sm:max-w-');
    expect(mediaViewerChromeFloatingToolbarLeadRowClass).not.toContain('sm:flex-none');
    expect(mediaViewerChromeFloatingToolbarLeadRowClass).toContain('overflow-visible');
  });

  it('floating title capsule grows with lead row instead of fixed 14rem cap', () => {
    expect(mediaViewerChromeFloatingTitleCapsuleClass).toContain('sm:flex-1');
    expect(mediaViewerChromeFloatingTitleCapsuleClass).not.toContain('14rem');
    expect(mediaViewerChromeFloatingTitleCapsuleClass).not.toContain('sm:max-w-');
  });

  it('floating capsules split title and window chrome; actions use one cluster pill', () => {
    expect(mediaViewerChromeFloatingTitleCapsuleClass).toContain('rounded-full');
    expect(mediaViewerChromeFloatingTitleCapsuleClass).toContain('pointer-events-auto');
    expect(mediaViewerChromeFloatingTitleCapsuleClass).toContain('h-9');
    expect(mediaViewerChromeFloatingWindowChromeCapsuleClass).toContain('rounded-full');
    expect(mediaViewerChromeFloatingWindowChromeCapsuleClass).toContain('h-9');
    expect(mediaViewerChromeFloatingIconButtonClass).toContain('pointer-events-auto');
    expect(mediaViewerChromeFloatingToolbarLeadRowClass).toContain('overflow-visible');
    expect(mediaViewerChromeFloatingActionsClusterClass).toContain('max-[479px]:basis-full');
    expect(mediaViewerChromeFloatingActionsClusterClass).toContain('min-[480px]:max-sm:basis-full');
    expect(mediaViewerChromeFloatingActionsClusterClass).toContain('overflow-visible');
    expect(mediaViewerChromeFloatingActionsClusterClass).not.toContain('overflow-x-auto');
    expect(mediaViewerChromeFloatingActionsClusterScrollClass).toContain('overflow-x-auto');
  });

  it('floating wide supplement blocks grow with content (no fixed h-10)', () => {
    expect(mediaViewerChromeFloatingWideBlockClass).not.toContain('h-10');
    expect(mediaViewerChromeFloatingWideBlockClass).toContain('py-2');
  });

  it('floating slider pill is flex-bounded to avoid infinite width', () => {
    expect(mediaViewerChromeFloatingSliderPillClass).toContain('flex-1');
    expect(mediaViewerChromeFloatingSliderPillClass).toContain('min-w-0');
    expect(mediaViewerChromeFloatingSliderPillClass).toContain('max-w-');
    expect(mediaViewerChromeFloatingSliderPillClass).toContain('overflow-hidden');
  });

  it('floating bottom uses individual pill classes', () => {
    expect(mediaViewerChromeFloatingBottomRowClass).toContain('justify-center');
    expect(mediaViewerChromeFloatingBottomPillClass).toContain('pointer-events-auto');
    expect(mediaViewerChromeFloatingSliderPillClass).toContain('pointer-events-auto');
    expect(mediaViewerChromeFloatingStatusPillClass).toContain('pointer-events-auto');
  });

  it('inline title truncates on narrow viewports', () => {
    expect(mediaViewerChromeToolbarTitleInlineClass).toContain('truncate');
    expect(mediaViewerChromeToolbarTitleInlineClass).toContain('max-sm:flex-1');
    expect(mediaViewerChromeToolbarLeadRowClass).toContain('overflow-hidden');
  });

  it('stacked toolbar title uses adaptive width when not inline', () => {
    expect(mediaViewerChromeToolbarTitleClass).toContain('w-auto');
    expect(mediaViewerChromeToolbarTitleClass).toContain('shrink');
  });

  it('overlay first row and window chrome follow compact/two-row breakpoints', () => {
    expect(mediaViewerChromeToolbarOverlayFirstRowClass).toContain('max-[359px]:flex');
    expect(mediaViewerChromeToolbarOverlayFirstRowClass).toContain('min-[360px]:max-[479px]:contents');
    expect(mediaViewerChromeToolbarOverlayFirstRowClass).toContain('min-[480px]:max-sm:flex');
    expect(mediaViewerChromeToolbarWindowChromeLeadClass).toContain('max-[359px]:flex');
    expect(mediaViewerChromeToolbarWindowChromeTrailClass).toContain('min-[360px]:max-[479px]:flex');
    expect(mediaViewerChromeToolbarWindowChromeTrailClass).toContain('min-[480px]:max-sm:hidden');
    expect(mediaViewerChromeToolbarWindowChromeTrailClass).toContain('sm:flex');
  });
});

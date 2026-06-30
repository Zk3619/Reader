import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/media/is-media-viewer-interactive-click', () => ({
  isMediaViewerInteractiveClick: () => false,
}));

vi.mock('@/lib/media/text/reader-text-selection-shared', () => ({
  shouldBlockReaderContentPrimaryClick: () => false,
}));

import {
  MEDIA_VIEWER_CLICK_PAIR_MS,
  createMediaViewerChromeInputHandlers,
} from '@/lib/media/media-viewer-chrome-input';

function clickEvent(): MouseEvent {
  return {
    target: {},
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent;
}

function pointerLeaveEvent(related: EventTarget | null): PointerEvent {
  const shell = {
    contains: () => false,
  } as unknown as HTMLElement;
  return {
    currentTarget: shell,
    relatedTarget: related,
  } as unknown as PointerEvent;
}

describe('media viewer chrome input', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('desktop pointer leave shell shows bars', () => {
    vi.stubGlobal(
      'navigator',
      { userAgent: 'Mozilla/5.0 Windows NT 10.0' } as Navigator,
    );
    let visible = false;
    const handlers = createMediaViewerChromeInputHandlers({
      headerVisible: () => visible,
      setHeaderVisible: (v) => {
        visible = v;
      },
      toggleBars: () => {
        visible = !visible;
      },
      enabled: () => true,
    });
    handlers.onShellPointerLeave(pointerLeaveEvent(null));
    expect(visible).toBe(true);
    handlers.dispose();
  });

  it('single click runs action after pair delay', () => {
    vi.stubGlobal(
      'navigator',
      { userAgent: 'Mozilla/5.0 iPhone' } as Navigator,
    );
    let actions = 0;
    const handlers = createMediaViewerChromeInputHandlers({
      headerVisible: () => true,
      setHeaderVisible: () => {},
      toggleBars: () => {},
      enabled: () => true,
    });
    handlers.onContentPrimaryClick(clickEvent(), () => actions++);
    expect(actions).toBe(0);
    vi.advanceTimersByTime(MEDIA_VIEWER_CLICK_PAIR_MS);
    expect(actions).toBe(1);
    handlers.dispose();
  });

  it('double-click toggles chrome only without running deferred single action', () => {
    vi.stubGlobal(
      'navigator',
      { userAgent: 'Mozilla/5.0 iPhone' } as Navigator,
    );
    let actions = 0;
    let barToggles = 0;
    const handlers = createMediaViewerChromeInputHandlers({
      headerVisible: () => true,
      setHeaderVisible: () => {},
      toggleBars: () => {
        barToggles += 1;
      },
      enabled: () => true,
    });
    const ev = clickEvent();
    handlers.onContentPrimaryClick(ev, () => actions++);
    handlers.onContentPrimaryClick(ev, () => actions++);
    handlers.onContentDblClick(ev);
    vi.advanceTimersByTime(MEDIA_VIEWER_CLICK_PAIR_MS);
    expect(actions).toBe(0);
    expect(barToggles).toBe(1);
    handlers.dispose();
  });

  it('double-click on video stage toggles chrome without play', () => {
    vi.stubGlobal(
      'navigator',
      { userAgent: 'Mozilla/5.0 iPhone' } as Navigator,
    );
    let plays = 0;
    let barToggles = 0;
    const handlers = createMediaViewerChromeInputHandlers({
      headerVisible: () => true,
      setHeaderVisible: () => {},
      toggleBars: () => {
        barToggles += 1;
      },
      enabled: () => true,
    });
    const ev = clickEvent();
    handlers.onContentPrimaryClick(ev, () => plays++);
    handlers.onContentPrimaryClick(ev, () => plays++);
    handlers.onContentDblClick(ev, { forceChrome: true });
    vi.advanceTimersByTime(MEDIA_VIEWER_CLICK_PAIR_MS);
    expect(plays).toBe(0);
    expect(barToggles).toBe(1);
    handlers.dispose();
  });

  it('after resetDismissGestureState, first click runs action instead of dismiss', () => {
    vi.stubGlobal(
      'navigator',
      { userAgent: 'Mozilla/5.0 Windows NT 10.0' } as Navigator,
    );
    let visible = true;
    let actions = 0;
    const handlers = createMediaViewerChromeInputHandlers({
      headerVisible: () => visible,
      setHeaderVisible: (v) => {
        visible = v;
      },
      toggleBars: () => {
        visible = !visible;
      },
      enabled: () => true,
    });
    handlers.onShellPointerLeave(pointerLeaveEvent(null));
    handlers.onShellPointerEnter({} as PointerEvent);
    visible = false;
    handlers.resetDismissGestureState();
    handlers.onContentPrimaryClick(clickEvent(), () => actions++);
    vi.advanceTimersByTime(MEDIA_VIEWER_CLICK_PAIR_MS);
    expect(actions).toBe(1);
    expect(visible).toBe(false);
    handlers.dispose();
  });

  it('pointer leave while bars already visible adopts persistent dismiss mode', () => {
    vi.stubGlobal(
      'navigator',
      { userAgent: 'Mozilla/5.0 Windows NT 10.0' } as Navigator,
    );
    let visible = true;
    let handlers!: ReturnType<typeof createMediaViewerChromeInputHandlers>;
    handlers = createMediaViewerChromeInputHandlers({
      headerVisible: () => visible,
      setHeaderVisible: (v) => {
        visible = v;
      },
      toggleBars: () => {
        visible = !visible;
      },
      enabled: () => true,
    });
    expect(handlers.shouldSuppressAutoHide()).toBe(false);
    handlers.onShellPointerLeave(pointerLeaveEvent(null));
    expect(visible).toBe(true);
    expect(handlers.shouldSuppressAutoHide()).toBe(true);
    handlers.dispose();
  });

  it('pointer leave shows bars and suppresses auto hide', () => {
    vi.stubGlobal(
      'navigator',
      { userAgent: 'Mozilla/5.0 Windows NT 10.0' } as Navigator,
    );
    let visible = false;
    const handlers = createMediaViewerChromeInputHandlers({
      headerVisible: () => visible,
      setHeaderVisible: (v) => {
        visible = v;
      },
      toggleBars: () => {
        visible = !visible;
      },
      enabled: () => true,
    });
    handlers.onShellPointerLeave(pointerLeaveEvent(null));
    expect(visible).toBe(true);
    expect(handlers.shouldSuppressAutoHide()).toBe(true);
    handlers.dispose();
  });

  it('double-click toggle does not suppress auto hide', () => {
    vi.stubGlobal(
      'navigator',
      { userAgent: 'Mozilla/5.0 iPhone' } as Navigator,
    );
    let visible = false;
    const handlers = createMediaViewerChromeInputHandlers({
      headerVisible: () => visible,
      setHeaderVisible: (v) => {
        visible = v;
      },
      toggleBars: () => {
        visible = !visible;
      },
      enabled: () => true,
    });
    handlers.onContentDblClick(clickEvent());
    expect(visible).toBe(true);
    expect(handlers.shouldSuppressAutoHide()).toBe(false);
    handlers.dispose();
  });

  it('pointer leave to selection handle does not show bars', () => {
    vi.stubGlobal(
      'navigator',
      { userAgent: 'Mozilla/5.0 Windows NT 10.0' } as Navigator,
    );
    const handle = {
      closest: (sel: string) => (sel.includes('data-reader-selection-handle') ? handle : null),
    };
    let visible = false;
    const handlers = createMediaViewerChromeInputHandlers({
      headerVisible: () => visible,
      setHeaderVisible: (v) => {
        visible = v;
      },
      toggleBars: () => {
        visible = !visible;
      },
      enabled: () => true,
    });
    handlers.onShellPointerLeave(pointerLeaveEvent(handle as unknown as EventTarget));
    expect(visible).toBe(false);
    handlers.dispose();
  });

  it('pointer leave does not show bars while text selection is active', () => {
    vi.stubGlobal(
      'navigator',
      { userAgent: 'Mozilla/5.0 Windows NT 10.0' } as Navigator,
    );
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: false,
        toString: () => '字',
      }),
    });
    let visible = false;
    const handlers = createMediaViewerChromeInputHandlers({
      headerVisible: () => visible,
      setHeaderVisible: (v) => {
        visible = v;
      },
      toggleBars: () => {
        visible = !visible;
      },
      enabled: () => true,
    });
    handlers.onShellPointerLeave(pointerLeaveEvent(null));
    expect(visible).toBe(false);
    handlers.dispose();
  });

  it('fixed layout: double-click does not toggle bars', () => {
    vi.stubGlobal(
      'navigator',
      { userAgent: 'Mozilla/5.0 iPhone' } as Navigator,
    );
    let barToggles = 0;
    const handlers = createMediaViewerChromeInputHandlers({
      headerVisible: () => true,
      setHeaderVisible: () => {},
      toggleBars: () => {
        barToggles += 1;
      },
      enabled: () => true,
      barsCollapsible: () => false,
    });
    const ev = clickEvent();
    handlers.onContentDblClick(ev);
    expect(barToggles).toBe(0);
    handlers.dispose();
  });
});

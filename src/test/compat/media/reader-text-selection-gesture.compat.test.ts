import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  READER_TEXT_SELECT_LONG_PRESS_MS,
  READER_TEXT_SELECT_MOVE_SLOP_PX,
  READER_TEXT_SELECTION_CLEARED_EVENT,
  clearDocumentTextSelection,
  clearReaderRegionalTapSuppress,
  createReaderTextSelectionGesture,
  dismissReaderTextSelectionOnClick,
  hasNonCollapsedTextSelection,
  isReaderTextSelectionSurfaceActive,
  selectCharacterAtClientPoint,
  shouldPreserveTextSelectionOnPointerDown,
  syncReaderTextSelectionSurface,
} from '@/lib/media/text/reader-text-selection-gesture';

function pointer(id: number, x: number, y: number, pointerType: string = 'mouse') {
  return { pointerId: id, clientX: x, clientY: y, pointerType };
}

function mockContainer(): HTMLElement {
  return {
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => true,
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
  } as unknown as HTMLElement;
}

function mockSelectionWindow(removeAllRanges: ReturnType<typeof vi.fn>, pointInSelection: boolean) {
  vi.stubGlobal('window', {
    getSelection: () => ({
      isCollapsed: false,
      toString: () => 'selected',
      removeAllRanges,
      rangeCount: 1,
      getRangeAt: () => ({
        getClientRects: () =>
          pointInSelection
            ? [{ left: 10, top: 10, right: 30, bottom: 28 }]
            : [{ left: 100, top: 100, right: 120, bottom: 118 }],
        getBoundingClientRect: () =>
          pointInSelection
            ? { left: 10, top: 10, right: 30, bottom: 28, width: 20, height: 18 }
            : { left: 100, top: 100, right: 120, bottom: 118, width: 20, height: 18 },
      }),
    }),
  });
}

describe('reader text selection gesture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearReaderRegionalTapSuppress();
  });

  it('blocks paged drag while waiting for long press', () => {
    const gesture = createReaderTextSelectionGesture({ enabled: () => true });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 10, 10), container);
    expect(gesture.blocksPagedDrag()).toBe(true);

    vi.advanceTimersByTime(READER_TEXT_SELECT_LONG_PRESS_MS + 1);
    expect(gesture.blocksPagedDrag()).toBe(true);
  });

  it('commits single character selection on release after long press', () => {
    const removeAllRanges = vi.fn();
    const addRange = vi.fn();
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: true,
        toString: () => '',
        removeAllRanges,
        addRange,
        rangeCount: 0,
      }),
    });
    vi.stubGlobal('document', {
      caretRangeFromPoint: () => ({
        startContainer: { nodeType: 3, textContent: '字典' },
        startOffset: 1,
      }),
      createRange: () => ({
        setStart: vi.fn(),
        setEnd: vi.fn(),
        collapse: vi.fn(),
      }),
      createTreeWalker: () => ({ nextNode: () => null }),
      dispatchEvent: vi.fn(),
    });

    const gesture = createReaderTextSelectionGesture({ enabled: () => true });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 20, 30), container);
    vi.advanceTimersByTime(READER_TEXT_SELECT_LONG_PRESS_MS);
    gesture.onPointerUp(pointer(1, 20, 30));

    expect(addRange).toHaveBeenCalled();
    expect(gesture.shouldSuppressRegionalTap()).toBe(true);
  });

  it('still commits when finger moves slightly after long press before release', () => {
    const addRange = vi.fn();
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: true,
        toString: () => '',
        removeAllRanges: vi.fn(),
        addRange,
        rangeCount: 0,
      }),
    });
    vi.stubGlobal('document', {
      caretRangeFromPoint: () => ({
        startContainer: { nodeType: 3, textContent: 'abc' },
        startOffset: 1,
      }),
      createRange: () => ({
        setStart: vi.fn(),
        setEnd: vi.fn(),
        collapse: vi.fn(),
      }),
      createTreeWalker: () => ({ nextNode: () => null }),
      dispatchEvent: vi.fn(),
    });

    const gesture = createReaderTextSelectionGesture({ enabled: () => true });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 0, 0), container);
    vi.advanceTimersByTime(READER_TEXT_SELECT_LONG_PRESS_MS);
    gesture.onPointerMove(pointer(1, READER_TEXT_SELECT_MOVE_SLOP_PX + 4, 0), container);
    expect(gesture.blocksPagedDrag()).toBe(true);
    gesture.onPointerUp(pointer(1, READER_TEXT_SELECT_MOVE_SLOP_PX + 4, 0));

    expect(addRange).toHaveBeenCalled();
  });

  it('cancels long press when movement exceeds slop before timeout', () => {
    const gesture = createReaderTextSelectionGesture({ enabled: () => true });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 0, 0), container);
    gesture.onPointerMove(
      pointer(1, READER_TEXT_SELECT_MOVE_SLOP_PX + 1, 0),
      container,
    );
    vi.advanceTimersByTime(READER_TEXT_SELECT_LONG_PRESS_MS + 1);
    expect(gesture.blocksPagedDrag()).toBe(false);

    gesture.onPointerUp(pointer(1, READER_TEXT_SELECT_MOVE_SLOP_PX + 1, 0));
    expect(gesture.shouldSuppressRegionalTap()).toBe(false);
  });

  it('does not start long press when chrome gate is closed', () => {
    const gesture = createReaderTextSelectionGesture({
      enabled: () => true,
      canStartLongPress: () => false,
    });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 10, 10), container);
    expect(gesture.blocksPagedDrag()).toBe(false);

    vi.advanceTimersByTime(READER_TEXT_SELECT_LONG_PRESS_MS + 1);
    gesture.onPointerUp(pointer(1, 10, 10));
    expect(gesture.shouldSuppressRegionalTap()).toBe(false);
  });

  it('commits long press even when chrome gate closes before release', () => {
    let gateOpen = true;
    const addRange = vi.fn();
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: true,
        toString: () => '',
        removeAllRanges: vi.fn(),
        addRange,
        rangeCount: 0,
      }),
    });
    vi.stubGlobal('document', {
      caretRangeFromPoint: () => ({
        startContainer: { nodeType: 3, textContent: '字典' },
        startOffset: 1,
      }),
      createRange: () => ({
        setStart: vi.fn(),
        setEnd: vi.fn(),
        collapse: vi.fn(),
      }),
      createTreeWalker: () => ({ nextNode: () => null }),
      dispatchEvent: vi.fn(),
    });

    const gesture = createReaderTextSelectionGesture({
      enabled: () => true,
      canStartLongPress: () => gateOpen,
    });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 20, 30), container);
    gateOpen = false;
    vi.advanceTimersByTime(READER_TEXT_SELECT_LONG_PRESS_MS);
    expect(gesture.blocksPagedDrag()).toBe(true);
    gesture.onPointerUp(pointer(1, 20, 30));

    expect(addRange).toHaveBeenCalled();
  });

  it('clears selection and suppresses click when tapping outside selection', () => {
    const removeAllRanges = vi.fn();
    mockSelectionWindow(removeAllRanges, false);

    const gesture = createReaderTextSelectionGesture({ enabled: () => true });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 5, 5), container);
    expect(removeAllRanges).toHaveBeenCalled();
    gesture.onPointerUp(pointer(1, 5, 5));
    expect(gesture.shouldSuppressRegionalTap()).toBe(true);
  });

  it('keeps selection when tapping inside selection body with outsideHandleAndSelection scope', () => {
    const removeAllRanges = vi.fn();
    mockSelectionWindow(removeAllRanges, true);

    const gesture = createReaderTextSelectionGesture({
      enabled: () => true,
      getDismissScope: () => 'outsideHandleAndSelection',
    });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 15, 15), container);
    expect(removeAllRanges).not.toHaveBeenCalled();
    gesture.onPointerUp(pointer(1, 15, 15));
    expect(gesture.shouldSuppressRegionalTap()).toBe(true);
  });

  it('clears selection when tapping inside selection body with outsideHandle scope', () => {
    const removeAllRanges = vi.fn();
    mockSelectionWindow(removeAllRanges, true);

    const gesture = createReaderTextSelectionGesture({
      enabled: () => true,
      getDismissScope: () => 'outsideHandle',
    });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 15, 15), container);
    expect(removeAllRanges).toHaveBeenCalled();
    gesture.onPointerUp(pointer(1, 15, 15));
    expect(gesture.shouldSuppressRegionalTap()).toBe(true);
  });

  it('shouldPreserveTextSelectionOnPointerDown only preserves for outsideHandleAndSelection', () => {
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: false,
        toString: () => 'x',
        rangeCount: 1,
        getRangeAt: () => ({
          getClientRects: () => [{ left: 0, top: 0, right: 10, bottom: 10 }],
          getBoundingClientRect: () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }),
        }),
      }),
    });
    expect(shouldPreserveTextSelectionOnPointerDown('outsideHandleAndSelection', 5, 5)).toBe(true);
    expect(shouldPreserveTextSelectionOnPointerDown('outsideHandle', 5, 5)).toBe(false);
  });

  it('keeps selection when tapping inside selection body', () => {
    const removeAllRanges = vi.fn();
    mockSelectionWindow(removeAllRanges, true);

    const gesture = createReaderTextSelectionGesture({ enabled: () => true });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 15, 15), container);
    expect(removeAllRanges).not.toHaveBeenCalled();
    gesture.onPointerUp(pointer(1, 15, 15));
    expect(gesture.shouldSuppressRegionalTap()).toBe(true);
  });

  it('suppresses regional tap after clearing existing selection', () => {
    const removeAllRanges = vi.fn();
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: false,
        toString: () => 'selected',
        removeAllRanges,
        rangeCount: 1,
        getRangeAt: () => ({
          getClientRects: () => [],
          getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
        }),
      }),
    });

    const gesture = createReaderTextSelectionGesture({ enabled: () => true });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 5, 5), container);
    expect(removeAllRanges).toHaveBeenCalled();
    expect(gesture.shouldSuppressRegionalTap()).toBe(true);

    gesture.onPointerUp(pointer(1, 5, 5));
    expect(gesture.shouldSuppressRegionalTap()).toBe(true);
  });

  it('hasNonCollapsedTextSelection treats whitespace as selected text', () => {
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: false,
        toString: () => '   ',
      }),
    });
    expect(hasNonCollapsedTextSelection()).toBe(true);
  });

  it('no-ops when disabled', () => {
    const gesture = createReaderTextSelectionGesture({ enabled: () => false });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 0, 0), container);
    expect(gesture.blocksPagedDrag()).toBe(false);
  });
});

describe('selectCharacterAtClientPoint fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearReaderRegionalTapSuppress();
  });

  it('selects nearest character when caretRangeFromPoint returns null', () => {
    const addRange = vi.fn();
    const textNode = { nodeType: 3, textContent: '你好' };
    const range = {
      startContainer: textNode as unknown,
      startOffset: 0,
      setStart(node: unknown, offset: number) {
        this.startContainer = node;
        this.startOffset = offset;
      },
      setEnd: vi.fn(),
      collapse: vi.fn(),
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 12, height: 18 }),
    };

    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: false,
        toString: () => '你',
        removeAllRanges: vi.fn(),
        addRange,
        rangeCount: 1,
      }),
    });

    let walkStep = 0;
    vi.stubGlobal('document', {
      caretRangeFromPoint: () => null,
      createRange: () => range,
      createTreeWalker: () => ({
        nextNode: () => (walkStep++ === 0 ? textNode : null),
      }),
      dispatchEvent: vi.fn(),
      elementsFromPoint: () => [],
      documentElement: { setAttribute: vi.fn(), removeAttribute: vi.fn() },
    });

    const root = {
      contains: () => true,
    } as unknown as Element;

    const ok = selectCharacterAtClientPoint(16, 29, root);
    expect(ok).toBe(true);
    expect(addRange).toHaveBeenCalled();
  });

  it('clearDocumentTextSelection dispatches cleared event and removes active mark', () => {
    const removeAllRanges = vi.fn();
    const removeAttribute = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      getSelection: () => ({
        removeAllRanges,
      }),
    });
    vi.stubGlobal('document', {
      documentElement: { removeAttribute },
      dispatchEvent,
    });

    clearDocumentTextSelection();

    expect(removeAllRanges).toHaveBeenCalled();
    expect(removeAttribute).toHaveBeenCalledWith('data-reader-text-selection-active');
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: READER_TEXT_SELECTION_CLEARED_EVENT }));
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'selectionchange' }));
  });

  it('isReaderTextSelectionSurfaceActive stays true when mark survives blur without selection', () => {
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: true,
        toString: () => '',
      }),
    });
    vi.stubGlobal('document', {
      documentElement: {
        hasAttribute: (name: string) => name === 'data-reader-text-selection-active',
        removeAttribute: vi.fn(),
      },
      dispatchEvent: vi.fn(),
    });

    expect(hasNonCollapsedTextSelection()).toBe(false);
    expect(isReaderTextSelectionSurfaceActive()).toBe(true);
  });

  it('syncReaderTextSelectionSurface hides selection UI but keeps dismiss mark', () => {
    const removeAttribute = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: true,
        toString: () => '',
        removeAllRanges: vi.fn(),
      }),
    });
    vi.stubGlobal('document', {
      documentElement: {
        hasAttribute: (name: string) => name === 'data-reader-text-selection-active',
        removeAttribute,
      },
      dispatchEvent,
    });

    syncReaderTextSelectionSurface();

    expect(removeAttribute).not.toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: READER_TEXT_SELECTION_CLEARED_EVENT }),
    );
    expect(isReaderTextSelectionSurfaceActive()).toBe(true);
    expect(dismissReaderTextSelectionOnClick()).toBe(true);
  });

  it('pointerdown dismiss keeps mark until click handler consumes it', () => {
    const removeAllRanges = vi.fn();
    const removeAttribute = vi.fn();
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: true,
        toString: () => '',
        removeAllRanges,
      }),
    });
    vi.stubGlobal('document', {
      documentElement: {
        hasAttribute: (name: string) => name === 'data-reader-text-selection-active',
        removeAttribute,
      },
      dispatchEvent: vi.fn(),
    });

    const gesture = createReaderTextSelectionGesture({ enabled: () => true });
    const container = mockContainer();

    gesture.onPointerDown(pointer(1, 5, 5), container);
    expect(removeAllRanges).toHaveBeenCalled();
    expect(removeAttribute).not.toHaveBeenCalled();
    expect(isReaderTextSelectionSurfaceActive()).toBe(true);

    gesture.onPointerUp(pointer(1, 5, 5));
    expect(dismissReaderTextSelectionOnClick()).toBe(true);
    expect(removeAttribute).toHaveBeenCalledWith('data-reader-text-selection-active');
  });

  it('dismissReaderTextSelectionOnClick consumes click when only active mark remains', () => {
    const removeAllRanges = vi.fn();
    const removeAttribute = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: true,
        toString: () => '',
        removeAllRanges,
      }),
    });
    vi.stubGlobal('document', {
      documentElement: {
        hasAttribute: (name: string) => name === 'data-reader-text-selection-active',
        removeAttribute,
      },
      dispatchEvent,
    });

    clearReaderRegionalTapSuppress();
    expect(dismissReaderTextSelectionOnClick()).toBe(true);
    expect(removeAllRanges).toHaveBeenCalled();
  });

  it('dismissReaderTextSelectionOnClick does not clear live selection after long press', () => {
    const removeAllRanges = vi.fn();
    const removeAttribute = vi.fn();
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: false,
        toString: () => '字',
        removeAllRanges,
      }),
    });
    vi.stubGlobal('document', {
      documentElement: {
        hasAttribute: (name: string) => name === 'data-reader-text-selection-active',
        removeAttribute,
      },
      dispatchEvent: vi.fn(),
    });

    expect(dismissReaderTextSelectionOnClick()).toBe(false);
    expect(removeAllRanges).not.toHaveBeenCalled();
    expect(removeAttribute).not.toHaveBeenCalled();
  });
});

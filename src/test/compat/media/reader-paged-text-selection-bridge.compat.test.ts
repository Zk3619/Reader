import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READER_TEXT_SELECT_LONG_PRESS_MS, createReaderTextSelectionGesture } from '@/lib/media/text/reader-text-selection-gesture';
import { attachReaderPagedTextSelectionBridge } from '@/lib/media/text/reader-paged-text-selection-bridge';

function createMockEventTarget() {
  const listeners = new Map<string, Set<(e: Event) => void>>();
  return {
    classList: { contains: () => true },
    contains: () => true,
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    hasAttribute(name: string) {
      return name === 'data-reader-long-press-armed';
    },
    get armed() {
      return (this as { _armed?: boolean })._armed === true;
    },
    set armed(v: boolean) {
      (this as { _armed?: boolean })._armed = v;
    },
    addEventListener(type: string, fn: (e: Event) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (e: Event) => void) {
      listeners.get(type)?.delete(fn);
    },
    dispatch(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string }) {
      const event = {
        type,
        button: init.button ?? 0,
        clientX: init.clientX ?? 0,
        clientY: init.clientY ?? 0,
        target: this,
        bubbles: true,
        cancelable: true,
        pointerType: init.pointerType ?? 'mouse',
        pointerId: init.pointerId ?? -1,
      } as unknown as MouseEvent;
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
  };
}

describe('reader paged text selection bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts long press from mousedown capture before page-turn early return', () => {
    const addRange = vi.fn();
    const windowListeners = new Map<string, Set<(e: Event) => void>>();
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: true,
        toString: () => '',
        removeAllRanges: vi.fn(),
        addRange,
        rangeCount: 0,
      }),
      addEventListener(type: string, fn: (e: Event) => void) {
        if (!windowListeners.has(type)) windowListeners.set(type, new Set());
        windowListeners.get(type)!.add(fn);
      },
      removeEventListener(type: string, fn: (e: Event) => void) {
        windowListeners.get(type)?.delete(fn);
      },
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
      elementsFromPoint: () => [],
      body: { querySelectorAll: () => [], querySelector: () => null, contains: () => true },
      documentElement: { setAttribute: vi.fn(), removeAttribute: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const viewport = createMockEventTarget();

    const gesture = createReaderTextSelectionGesture({
      enabled: () => true,
      canStartLongPress: () => true,
    });
    const detach = attachReaderPagedTextSelectionBridge(viewport as unknown as HTMLElement, {
      gesture,
      isEnabled: () => true,
      isHandleDragActive: () => false,
      isInteractiveTarget: () => false,
    });

    viewport.dispatch('mousedown', { clientX: 12, clientY: 18, button: 0 });
    vi.advanceTimersByTime(READER_TEXT_SELECT_LONG_PRESS_MS);
    expect(viewport.setAttribute).toHaveBeenCalledWith('data-reader-long-press-armed', '');

    const mouseUp = {
      type: 'mouseup',
      button: 0,
      clientX: 12,
      clientY: 18,
      target: viewport,
      bubbles: true,
      cancelable: true,
    } as unknown as MouseEvent;
    for (const fn of windowListeners.get('mouseup') ?? []) fn(mouseUp);
    expect(addRange).toHaveBeenCalled();

    detach();
  });

  it('commits long press on mouseup when pointerup is missing', () => {
    const addRange = vi.fn();
    const windowListeners = new Map<string, Set<(e: Event) => void>>();
    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: true,
        toString: () => '',
        removeAllRanges: vi.fn(),
        addRange,
        rangeCount: 0,
      }),
      addEventListener(type: string, fn: (e: Event) => void) {
        if (!windowListeners.has(type)) windowListeners.set(type, new Set());
        windowListeners.get(type)!.add(fn);
      },
      removeEventListener(type: string, fn: (e: Event) => void) {
        windowListeners.get(type)?.delete(fn);
      },
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
      elementsFromPoint: () => [],
      body: { querySelectorAll: () => [], querySelector: () => null, contains: () => true },
      documentElement: { setAttribute: vi.fn(), removeAttribute: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const viewport = createMockEventTarget();
    const gesture = createReaderTextSelectionGesture({
      enabled: () => true,
      canStartLongPress: () => true,
    });
    const detach = attachReaderPagedTextSelectionBridge(viewport as unknown as HTMLElement, {
      gesture,
      isEnabled: () => true,
      isHandleDragActive: () => false,
      isInteractiveTarget: () => false,
    });

    viewport.dispatch('pointerdown', { clientX: 12, clientY: 18, button: 0, pointerId: 1 });
    vi.advanceTimersByTime(READER_TEXT_SELECT_LONG_PRESS_MS);

    const mouseUp = {
      type: 'mouseup',
      button: 0,
      clientX: 12,
      clientY: 18,
      target: viewport,
      bubbles: true,
      cancelable: true,
    } as unknown as MouseEvent;
    for (const fn of windowListeners.get('mouseup') ?? []) fn(mouseUp);
    expect(addRange).toHaveBeenCalled();

    detach();
  });
});

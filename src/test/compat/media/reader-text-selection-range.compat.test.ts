import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSelectionHandleLayoutAtBoundary,
  getSelectionHandleLayouts,
} from '@/lib/media/text/reader-text-selection-range';

describe('getSelectionHandleLayouts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('places start and end handles on their respective line bottoms', () => {
    const range = {
      cloneRange: () => range,
      collapse: (toStart: boolean) => {
        (range as { _collapsed?: boolean })._collapsed = toStart;
      },
      getClientRects: () => {
        const collapsed = (range as { _collapsed?: boolean })._collapsed;
        if (collapsed === true) {
          return [{ left: 40, top: 100, right: 40, bottom: 118, width: 0, height: 18 }];
        }
        if (collapsed === false) {
          return [{ left: 200, top: 160, right: 200, bottom: 178, width: 0, height: 18 }];
        }
        return [];
      },
      getBoundingClientRect: () => ({
        left: 40,
        top: 100,
        right: 200,
        bottom: 178,
        width: 160,
        height: 78,
      }),
    };

    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => range,
      }),
    });

    const layouts = getSelectionHandleLayouts();
    expect(layouts).toEqual([
      { side: 'start', x: 40 - 24, y: 118 },
      { side: 'end', x: 200, y: 178 },
    ]);
  });

  it('anchors end handle to inline image when collapsed caret rect is empty', () => {
    const img = {
      tagName: 'IMG',
      nodeType: 1,
      classList: { contains: () => false },
      querySelector: () => null,
      getBoundingClientRect: () => ({
        left: 120,
        top: 80,
        right: 220,
        bottom: 180,
        width: 100,
        height: 100,
      }),
    };

    const paragraph = {
      nodeType: 1,
      tagName: 'P',
      childNodes: [{ nodeType: 3 }, img],
      classList: { contains: () => false },
      querySelector: () => null,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
      }),
    };

    const range = {
      startContainer: paragraph,
      startOffset: 0,
      endContainer: paragraph,
      endOffset: 2,
      cloneRange: () => range,
      collapse: (toStart: boolean) => {
        (range as { _collapsed?: boolean })._collapsed = toStart;
      },
      getClientRects: () => {
        const collapsed = (range as { _collapsed?: boolean })._collapsed;
        if (collapsed === true) {
          return [{ left: 40, top: 100, right: 40, bottom: 118, width: 0, height: 18 }];
        }
        if (collapsed === false) {
          return [];
        }
        return [{ left: 40, top: 100, right: 220, bottom: 180, width: 180, height: 80 }];
      },
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
      }),
    };

    vi.stubGlobal('window', {
      getSelection: () => ({
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => range,
      }),
    });

    const layouts = getSelectionHandleLayouts();
    expect(layouts).toEqual([
      { side: 'start', x: 40 - 24, y: 118 },
      { side: 'end', x: 220, y: 180 },
    ]);
  });
});

describe('getSelectionHandleLayoutAtBoundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('anchors end boundary layout to preceding inline image', () => {
    const img = {
      tagName: 'IMG',
      nodeType: 1,
      classList: { contains: () => false },
      querySelector: () => null,
      getBoundingClientRect: () => ({
        left: 120,
        top: 80,
        right: 220,
        bottom: 180,
        width: 100,
        height: 100,
      }),
    };

    const paragraph = {
      nodeType: 1,
      tagName: 'P',
      childNodes: [{ nodeType: 3 }, img],
      classList: { contains: () => false },
      querySelector: () => null,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
      }),
    };

    const probe = {
      startContainer: paragraph,
      startOffset: 0,
      endContainer: paragraph,
      endOffset: 0,
      cloneRange: () => probe,
      collapse: () => {},
      getClientRects: () => [],
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
      }),
      setStart(container: typeof paragraph, offset: number) {
        probe.startContainer = container;
        probe.endContainer = container;
        probe.startOffset = offset;
        probe.endOffset = offset;
      },
    };

    vi.stubGlobal('document', {
      createRange: () => probe,
    });

    const layout = getSelectionHandleLayoutAtBoundary('end', paragraph as unknown as Node, 2);
    expect(layout).toEqual({ side: 'end', x: 220, y: 180 });
  });
});

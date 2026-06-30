import { describe, expect, it, vi, afterEach } from 'vitest';
import { queryReaderTextContentRootAtPoint } from '@/lib/media/text/reader-text-selection-hit-test';

describe('queryReaderTextContentRootAtPoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers visible root from elementsFromPoint stack', () => {
    const live = {
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100 }),
    };
    const measure = {
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100 }),
    };
    vi.stubGlobal('window', {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    });
    vi.stubGlobal('document', {
      elementsFromPoint: () => [
        {
          closest: (sel: string) => {
            if (sel.includes('reader-paged-live-inner')) return null;
            if (sel.includes('reader-paged-measure-host')) return null;
            if (sel.includes('data-reader-content')) return live;
            return null;
          },
        },
      ],
    });

    const container = {
      contains: (el: unknown) => el === live || el === measure,
      querySelector: () => measure,
      querySelectorAll: () => [measure, live],
    } as unknown as HTMLElement;

    expect(queryReaderTextContentRootAtPoint(container, 50, 50)).toBe(live);
  });
});

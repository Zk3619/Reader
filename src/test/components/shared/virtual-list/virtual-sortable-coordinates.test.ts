import { describe, expect, it } from 'vitest';
import {
  pointerListBodyContentY,
  resolveSortableIndexFromContentOffset,
} from '@/components/shared/virtual-list/virtual-sortable-coordinates';

describe('pointerListBodyContentY', () => {
  it('subtracts list body offset so scrollHeader does not inflate row index', () => {
    const listBody = {
      getBoundingClientRect: () => ({ top: 140, left: 0, width: 400, height: 400 }),
    } as unknown as HTMLElement;

    const scrollEl = {
      getBoundingClientRect: () => ({ top: 100, left: 0, width: 400, height: 500 }),
      scrollTop: 0,
      scrollLeft: 0,
      contains: (node: unknown) => node === listBody,
    } as unknown as HTMLElement;

    // Mock getComputedStyle padding for scrollEl
    const original = globalThis.getComputedStyle;
    globalThis.getComputedStyle = (() =>
      ({
        paddingLeft: '0',
        paddingTop: '0',
      }) as CSSStyleDeclaration) as typeof getComputedStyle;

    try {
      // Pointer near first row top (y=160 → contentY=60); body at 40 → relative 20 → index 0
      const relativeY = pointerListBodyContentY(scrollEl, listBody, 10, 160);
      expect(relativeY).toBe(20);
      expect(
        resolveSortableIndexFromContentOffset(relativeY, 5, () => 44),
      ).toBe(0);

      // Without body offset, contentY=60 would resolve past first-row midpoint → index 1
      expect(resolveSortableIndexFromContentOffset(60, 5, () => 44)).toBe(1);
    } finally {
      globalThis.getComputedStyle = original;
    }
  });

  it('falls back to scroll content Y when list body is missing', () => {
    const scrollEl = {
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 400, height: 500 }),
      scrollTop: 80,
      scrollLeft: 0,
      contains: () => false,
    } as unknown as HTMLElement;

    const original = globalThis.getComputedStyle;
    globalThis.getComputedStyle = (() =>
      ({
        paddingLeft: '0',
        paddingTop: '0',
      }) as CSSStyleDeclaration) as typeof getComputedStyle;

    try {
      expect(pointerListBodyContentY(scrollEl, null, 0, 20)).toBe(100);
    } finally {
      globalThis.getComputedStyle = original;
    }
  });
});

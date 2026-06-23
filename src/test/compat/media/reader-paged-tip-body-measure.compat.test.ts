import { describe, expect, it } from 'vitest';
import {
  pagedMeasureRootHasUsableBlocks,
  pagedMeasureRootLegadoPlaceholdersPending,
  readStrictTipBodyClipHeightPx,
  tipBodyReadyForPagedMeasure,
} from '@/lib/media/text/reader-paged-tip-body-measure';
import { defaultTextViewerPageTipsConfig } from '@/lib/media/text/reader-ui-config';

function mockMeasureTree(blocks: Array<{
  height: number;
  legado?: boolean;
  placeholderHeight?: number;
  hasPlaceholder?: boolean;
}>) {
  const blockEls = blocks.map((b) => {
    const placeholder =
      b.legado && b.hasPlaceholder !== false
        ? {
            getBoundingClientRect: () => ({ height: b.placeholderHeight ?? 0 }),
          }
        : null;
    return {
      getBoundingClientRect: () => ({ height: b.height }),
      hasAttribute: (name: string) => b.legado === true && name === 'data-reader-legado-inline',
      querySelector: () => placeholder,
    };
  });

  const body = {
    querySelector: () => null,
    querySelectorAll: (sel: string) => {
      if (sel === '[data-reader-measure-block]') return blockEls;
      if (sel === '[data-reader-legado-inline]') {
        return blockEls.filter((_, i) => blocks[i]?.legado);
      }
      return [];
    },
  };

  const root = {
    querySelector: (sel: string) => (sel === '.reader-body' ? body : null),
  };

  return root as unknown as HTMLElement;
}

describe('pagedMeasureRootHasUsableBlocks', () => {
  it('returns false when no measure blocks', () => {
    const root = mockMeasureTree([]);
    expect(pagedMeasureRootHasUsableBlocks(root)).toBe(false);
  });

  it('returns true when at least one block has height', () => {
    const root = mockMeasureTree([{ height: 24 }]);
    expect(pagedMeasureRootHasUsableBlocks(root)).toBe(true);
  });

  it('does not block entire root when legado placeholder is not ready (首屏引导)', () => {
    const root = mockMeasureTree([
      { height: 22 },
      { height: 20, legado: true, placeholderHeight: 0 },
    ]);
    expect(pagedMeasureRootHasUsableBlocks(root)).toBe(true);
  });

  it('returns false when all blocks have zero height', () => {
    const root = mockMeasureTree([
      { height: 0 },
      { height: 0, legado: true, placeholderHeight: 0 },
    ]);
    expect(pagedMeasureRootHasUsableBlocks(root)).toBe(false);
  });
});

describe('pagedMeasureRootLegadoPlaceholdersPending', () => {
  it('detects pending legado placeholder', () => {
    const root = mockMeasureTree([
      { height: 22, legado: true, placeholderHeight: 0 },
    ]);
    expect(pagedMeasureRootLegadoPlaceholdersPending(root)).toBe(true);
  });

  it('returns false when legado placeholder has height', () => {
    const root = mockMeasureTree([
      { height: 22, legado: true, placeholderHeight: 18 },
    ]);
    expect(pagedMeasureRootLegadoPlaceholdersPending(root)).toBe(false);
  });
});

describe('tipBodyReadyForPagedMeasure', () => {
  it('allows bootstrap when no chrome and frame has height but tip-body not laid out yet', () => {
    const tips = { ...defaultTextViewerPageTipsConfig, headerMode: 'never' as const, footerMode: 'never' as const };
    const frame = { clientHeight: 800 } as HTMLElement;
    const tipBody = { clientHeight: 0 } as HTMLElement;
    expect(readStrictTipBodyClipHeightPx(tipBody)).toBe(0);
    expect(tipBodyReadyForPagedMeasure(frame, tipBody, tips, false)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import {
  EXPLORE_KIND_DEFAULT_BASIS_PERCENT,
  exploreDrawerRowItemStyle,
  groupExploreSectionsIntoRows,
  legadoFlexChildStyleToCss,
  legadoFlexChildWrapperStyle,
} from '@/lib/book-source/legado-flex-child-style';

describe('legado flex child style', () => {
  it('defaults to one third width for empty style', () => {
    expect(legadoFlexChildStyleToCss(undefined).flexBasis).toBe('33.333%');
    expect(EXPLORE_KIND_DEFAULT_BASIS_PERCENT).toBeCloseTo(1 / 3);
  });

  it('maps script layout_flexBasisPercent like Legado', () => {
    expect(
      legadoFlexChildStyleToCss({ layout_flexBasisPercent: 0.4 }).flexBasis,
    ).toBe('40%');
    expect(
      legadoFlexChildStyleToCss({ layout_flexBasisPercent: 1 }).flexBasis,
    ).toBe('100%');
    expect(
      legadoFlexChildStyleToCss({ layout_flexBasisPercent: -1 }).flexBasis,
    ).toBe('33.333%');
  });

  it('wrapper pins width to flexBasis', () => {
    const wrap = legadoFlexChildWrapperStyle({ layout_flexBasisPercent: 0.5 });
    expect(wrap.width).toBe('50%');
    expect(wrap.maxWidth).toBe('50%');
  });

  it('groups rows and stretches underfilled row to full width', () => {
    const sections: ExploreSection[] = [
      { title: 'a', style: { layout_flexBasisPercent: 0.4 } },
      { title: 'b', style: { layout_flexBasisPercent: 0.4 } },
      { title: 'c' },
      { title: 'd' },
      { title: 'e' },
    ];
    expect(groupExploreSectionsIntoRows(sections, 'legado')).toEqual([
      [sections[0], sections[1]],
      [sections[2], sections[3], sections[4]],
    ]);
    const row = [sections[0], sections[1]];
    expect(exploreDrawerRowItemStyle(sections[0], row).flex).toBe('0.5 1 0');
    expect(exploreDrawerRowItemStyle(sections[1], row).flex).toBe('0.5 1 0');

    const uneven: ExploreSection[] = [
      { title: 'x', style: { layout_flexBasisPercent: 0.3 } },
      { title: 'y', style: { layout_flexBasisPercent: 0.1 } },
    ];
    expect(exploreDrawerRowItemStyle(uneven[0], uneven).flex).toBe('0.5 1 0');
    expect(exploreDrawerRowItemStyle(uneven[1], uneven).flex).toBe('0.5 1 0');
  });

  it('never puts more than three items in one drawer row', () => {
    const quarter: ExploreSection[] = Array.from({ length: 4 }, (_, i) => ({
      title: `q${i}`,
      style: { layout_flexBasisPercent: 0.25 },
    }));
    const grouped = groupExploreSectionsIntoRows(quarter, 'legado');
    expect(grouped.map((r) => r.length)).toEqual([3, 1]);

    const plain: ExploreSection[] = Array.from({ length: 7 }, (_, i) => ({
      title: `p${i}`,
    }));
    expect(groupExploreSectionsIntoRows(plain, 'legado').map((r) => r.length)).toEqual([3, 3, 1]);
  });

  it('default scheme does not cap columns per row', () => {
    const quarter: ExploreSection[] = Array.from({ length: 4 }, (_, i) => ({
      title: `q${i}`,
      style: { layout_flexBasisPercent: 0.25 },
    }));
    expect(groupExploreSectionsIntoRows(quarter, 'default')).toEqual([quarter]);
  });
});

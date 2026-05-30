import { describe, expect, it } from 'vitest';
import {
  migrateReaderImageStyle,
  parseShowCmtCall,
  resolveLegadoImageLayout,
  segmentIndexFromReviewUrl,
} from '@/lib/js-engine/legado/legado-image-options';

describe('legado-image-options', () => {
  it('parseShowCmtCall 解析段评 click', () => {
    const parsed = parseShowCmtCall(
      "showCmt('/get_para_review?book_id=&item_id=1&para=0&source=番茄', '番茄', 1)",
    );
    expect(parsed?.reviewUrl).toContain('para=0');
    expect(parsed?.sources).toBe('番茄');
    expect(parsed?.ydv).toBe(1);
  });

  it('parseShowCmtCall 支持第三参 true/false（晴天 islyc）', () => {
    const parsed = parseShowCmtCall(
      "showCmt('/get_para_review?book_id=&item_id=1&para=0&source=番茄', '番茄', true)",
    );
    expect(parsed?.ydv).toBe(1);
    expect(parseShowCmtCall("showCmt('/get_para_review?x=1', '番茄', false)")?.ydv).toBe(0);
  });

  it('parseShowCmtCall 支持 js 键与直接路径', () => {
    expect(
      parseShowCmtCall('/get_para_review?book_id=&item_id=1&para=2&source=番茄')?.reviewUrl,
    ).toContain('para=2');
    expect(
      parseShowCmtCall("  showCmt('/get_para_review?x=1', '番茄', false);  ")?.reviewUrl,
    ).toBe('/get_para_review?x=1');
  });

  it('segmentIndexFromReviewUrl para+1', () => {
    expect(
      segmentIndexFromReviewUrl('/get_para_review?book_id=&item_id=1&para=0&source=番茄'),
    ).toBe(1);
  });

  it('resolveLegadoImageLayout 单图 text 优先于书级', () => {
    expect(resolveLegadoImageLayout('FULL', 'text')).toBe('TEXT');
    expect(resolveLegadoImageLayout('DEFAULT', 'TEXT')).toBe('TEXT_WIDE');
    expect(resolveLegadoImageLayout('TEXT', undefined)).toBe('TEXT');
  });

  it('migrateReaderImageStyle 兼容旧值', () => {
    expect(migrateReaderImageStyle('default')).toBe('DEFAULT');
    expect(migrateReaderImageStyle('CENTER')).toBe('DEFAULT');
    expect(migrateReaderImageStyle('FULL')).toBe('FULL');
  });
});

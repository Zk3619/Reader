import { describe, expect, it } from 'vitest';
import {
  bookPageAnimPickerToLegado,
  legadoPageAnimToPickerValue,
  legadoPageAnimToTextViewer,
  normalizeLegadoPageAnim,
  resolveBookTextViewerPageAnim,
  textViewerPageAnimToLegado,
} from '@/lib/book/legado-page-anim';
import type { Book } from '@/types';

describe('legado-page-anim', () => {
  it('maps Legado ints to TextViewerPageAnim', () => {
    expect(legadoPageAnimToTextViewer(-1)).toBeNull();
    expect(legadoPageAnimToTextViewer(0)).toBe('cover');
    expect(legadoPageAnimToTextViewer(2)).toBe('simulation');
    expect(legadoPageAnimToTextViewer(4)).toBe('none');
  });

  it('maps TextViewerPageAnim back to Legado ints', () => {
    expect(textViewerPageAnimToLegado('slide')).toBe(1);
    expect(bookPageAnimPickerToLegado('default')).toBe(-1);
    expect(bookPageAnimPickerToLegado('scroll')).toBe(3);
  });

  it('normalizes import values', () => {
    expect(normalizeLegadoPageAnim(-1)).toBe(-1);
    expect(normalizeLegadoPageAnim('2')).toBe(2);
    expect(normalizeLegadoPageAnim(99)).toBeUndefined();
  });

  it('resolves book override vs ui default', () => {
    const book = {
      readConfig: { pageAnim: 1 },
    } as Book;
    expect(resolveBookTextViewerPageAnim(book, 'cover')).toBe('slide');
    expect(resolveBookTextViewerPageAnim({ readConfig: { pageAnim: -1 } } as Book, 'cover')).toBe(
      'cover',
    );
    expect(legadoPageAnimToPickerValue(3)).toBe('scroll');
  });
});

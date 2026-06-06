import { describe, expect, it } from 'vitest';
import {
  readerPagedSlideIncomingTransform,
  readerPagedSlideOutgoingTransform,
  readerPagedSlideTurnOffsetPx,
} from '@/lib/media/text/reader-paged-turn-style';

describe('reader-paged slide turn', () => {
  it('offsets outgoing and incoming in sync for next page', () => {
    const span = 400;
    const offset = readerPagedSlideTurnOffsetPx('next', span, { dragOffsetPx: -100 });
    expect(offset).toBe(-100);
    expect(readerPagedSlideOutgoingTransform(offset)).toBe('translate3d(-100px, 0, 0)');
    expect(readerPagedSlideIncomingTransform('next', span, offset)).toBe(
      'translate3d(300px, 0, 0)',
    );
  });

  it('offsets outgoing and incoming in sync for prev page', () => {
    const span = 400;
    const offset = readerPagedSlideTurnOffsetPx('prev', span, { dragOffsetPx: 120 });
    expect(readerPagedSlideOutgoingTransform(offset)).toBe('translate3d(120px, 0, 0)');
    expect(readerPagedSlideIncomingTransform('prev', span, offset)).toBe(
      'translate3d(-280px, 0, 0)',
    );
  });

  it('uses progress ratio when animating', () => {
    const offset = readerPagedSlideTurnOffsetPx('next', 500, { progressRatio: 0.5 });
    expect(offset).toBe(-250);
    expect(readerPagedSlideIncomingTransform('next', 500, offset)).toBe(
      'translate3d(250px, 0, 0)',
    );
  });
});

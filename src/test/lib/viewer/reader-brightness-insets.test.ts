import { describe, expect, it } from 'vitest';
import { stabilizeReaderBrightnessChromeInsets } from '@/lib/viewer/reader-brightness-insets';

describe('stabilizeReaderBrightnessChromeInsets', () => {
  it('小于阈值的抖动保持原值', () => {
    const prev = { top: 80, bottom: 64 };
    expect(stabilizeReaderBrightnessChromeInsets(prev, { top: 81, bottom: 65 })).toEqual(prev);
  });

  it('超过阈值时采用新值', () => {
    const prev = { top: 80, bottom: 64 };
    expect(stabilizeReaderBrightnessChromeInsets(prev, { top: 84, bottom: 64 })).toEqual({
      top: 84,
      bottom: 64,
    });
  });
});

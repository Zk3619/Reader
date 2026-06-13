import { describe, expect, it } from 'vitest';
import {
  beginExploreSectionsFetch,
  cancelExploreSectionsFetch,
  isExploreSectionsFetchSuperseded,
} from '@/lib/book-source/explore-sections-fetch';

describe('explore-sections-fetch', () => {
  it('cancelExploreSectionsFetch aborts prior signal and bumps generation', () => {
    const first = beginExploreSectionsFetch('src-a');
    expect(first.generation).toBe(1);
    expect(first.signal.aborted).toBe(false);

    const second = beginExploreSectionsFetch('src-a');
    expect(first.signal.aborted).toBe(true);
    expect(second.generation).toBe(2);
    expect(isExploreSectionsFetchSuperseded('src-a', 1)).toBe(true);
    expect(isExploreSectionsFetchSuperseded('src-a', 2)).toBe(false);
  });

  it('generations are isolated per source key', () => {
    const a = beginExploreSectionsFetch('src-b-isolated');
    const b = beginExploreSectionsFetch('src-c-isolated');
    expect(isExploreSectionsFetchSuperseded('src-b-isolated', a.generation)).toBe(false);
    expect(isExploreSectionsFetchSuperseded('src-c-isolated', b.generation)).toBe(false);
    cancelExploreSectionsFetch('src-b-isolated');
    expect(isExploreSectionsFetchSuperseded('src-b-isolated', a.generation)).toBe(true);
    expect(isExploreSectionsFetchSuperseded('src-c-isolated', b.generation)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  READER_INLINE_IMAGE_FETCH_CONCURRENCY,
  withReaderInlineImageFetchSlot,
} from '@/lib/http/reader-inline-image-queue';

describe('reader-inline-image-queue', () => {
  it('limits concurrent fetches', async () => {
    let peak = 0;
    let active = 0;

    const tasks = Array.from({ length: 8 }, () =>
      withReaderInlineImageFetchSlot(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
      }),
    );

    await Promise.all(tasks);
    expect(peak).toBeLessThanOrEqual(READER_INLINE_IMAGE_FETCH_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });

  it('serves high priority before low when pool is full', async () => {
    const order: string[] = [];
    const blockers = Array.from({ length: READER_INLINE_IMAGE_FETCH_CONCURRENCY }, () =>
      withReaderInlineImageFetchSlot(
        () => new Promise<void>((r) => setTimeout(r, 40)),
      ),
    );
    await new Promise((r) => setTimeout(r, 5));

    const low = withReaderInlineImageFetchSlot(async () => {
      order.push('low');
    }, 'low');
    const high = withReaderInlineImageFetchSlot(async () => {
      order.push('high');
    }, 'high');

    await Promise.all([...blockers, low, high]);
    expect(order).toEqual(['high', 'low']);
  });
});

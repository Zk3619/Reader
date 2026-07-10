import { describe, expect, it } from 'vitest';
import { firstSuccess, hasItems, safeCall } from '@/lib/media/audio/music-sdk/fallback';

describe('music-sdk fallback', () => {
  it('firstSuccess returns first valid provider result', async () => {
    const result = await firstSuccess(
      [
        async () => null,
        async () => [],
        async () => ['ok'],
      ],
      hasItems,
    );
    expect(result).toEqual(['ok']);
  });

  it('firstSuccess returns null when all providers fail', async () => {
    const result = await firstSuccess(
      [
        async () => {
          throw new Error('fail');
        },
        async () => null,
        async () => [],
      ],
      hasItems,
    );
    expect(result).toBeNull();
  });

  it('hasItems narrows non-empty arrays', () => {
    expect(hasItems([])).toBe(false);
    expect(hasItems([1])).toBe(true);
    expect(hasItems(null)).toBe(false);
  });

  it('safeCall swallows errors', async () => {
    const value = await safeCall(async () => {
      throw new Error('boom');
    });
    expect(value).toBeNull();
  });
});

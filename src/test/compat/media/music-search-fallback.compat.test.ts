import { describe, expect, it, vi } from 'vitest';
import { firstFullest, firstSuccess } from '@/lib/media/audio/music-sdk/fallback';

describe('firstFullest', () => {
  it('keeps searching until preferred size is met', async () => {
    const a = vi.fn(async () => ({ tracks: [1, 2], total: 2 }));
    const b = vi.fn(async () => ({ tracks: Array.from({ length: 30 }, (_, i) => i), total: 30 }));
    const result = await firstFullest(
      [a, b],
      (r) => r.tracks.length,
      30,
      (r) => r.tracks.length > 0,
    );
    expect(result?.tracks).toHaveLength(30);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('falls back to the longest valid result when none meet preferred size', async () => {
    const result = await firstFullest(
      [
        async () => ({ n: 10 }),
        async () => ({ n: 22 }),
        async () => ({ n: 18 }),
      ],
      (r) => r.n,
      30,
    );
    expect(result).toEqual({ n: 22 });
  });
});

describe('firstSuccess', () => {
  it('returns the first valid value', async () => {
    const result = await firstSuccess(
      [async () => null, async () => ({ ok: true })],
      (v) => Boolean(v),
    );
    expect(result).toEqual({ ok: true });
  });
});

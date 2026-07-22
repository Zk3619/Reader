import { describe, expect, it } from 'vitest';

import {
  isBuiltinMusicUrlEnabled,
  tryResolveBuiltinUrl,
} from '@/lib/media/audio/platform/fallback-resolver';

const track = {
  id: 'wy__1',
  source: 'wy' as const,
  name: 'Song',
  artist: 'Artist',
  duration: '03:00',
  meta: {},
};

describe('builtin musicUrl removed (LX production path)', () => {
  it('never enables builtin musicUrl', () => {
    expect(isBuiltinMusicUrlEnabled()).toBe(false);
  });

  it('tryResolveBuiltinUrl always returns null', async () => {
    await expect(tryResolveBuiltinUrl(track)).resolves.toBeNull();
  });
});

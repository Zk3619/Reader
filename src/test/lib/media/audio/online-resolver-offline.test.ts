import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCached: vi.fn(),
  createObjectUrl: vi.fn(() => 'blob:cached-track'),
  userApiMusicUrl: vi.fn(),
  request: vi.fn(),
  builtinUrl: vi.fn(),
}));

vi.mock('@/lib/media/audio/library/local-resolver', () => ({
  resolveLocalTrackUrl: vi.fn(() => null),
  resolveLocalTrackUrlAsync: vi.fn(async () => ({ url: '', revoke: () => {} })),
}));
vi.mock('@/lib/media/audio/online/user-api-engine', () => ({
  userApiMusicUrl: mocks.userApiMusicUrl,
  isActiveUserApiId: vi.fn(() => false),
  listEnabledUserApiScriptIdsForUrl: vi.fn(() => []),
  listUserApiScriptIdsForPlayback: vi.fn(() => []),
  listUserApiScripts: vi.fn(() => []),
  getActiveUserApiDisplayName: vi.fn(() => ''),
}));
vi.mock('@/lib/media/audio/online/user-api-settings', () => ({
  getMusicOfflineMode: vi.fn(() => true),
}));
vi.mock('@/lib/media/audio/music-settings', () => ({
  getMusicSettings: vi.fn(() => ({ urlSourceMode: 'userApi', fallbackUrl: true })),
}));
vi.mock('@/lib/media/audio/music-quality', () => ({
  getPlayQuality: vi.fn(() => '320k'),
}));
vi.mock('@/lib/media/audio/audio-disk-cache', () => ({
  cacheMusicTrackAudio: vi.fn(),
  createAudioObjectUrl: mocks.createObjectUrl,
  getCachedMusicTrackByTrackId: mocks.getCached,
}));
vi.mock('@/lib/media/audio/platform/fallback-resolver', () => ({
  resolveLastResortTrackUrl: vi.fn(),
  getOtherSourceTracks: vi.fn(),
  tryResolveBuiltinUrl: mocks.builtinUrl,
  notifyToggleTry: vi.fn(),
  isFallbackResolverEnabled: vi.fn(() => true),
  isBuiltinMusicUrlEnabled: vi.fn(() => false),
}));
vi.mock('@/lib/http', () => ({ request: mocks.request }));
vi.mock('@/lib/platform/detect', () => ({ isTauri: vi.fn(() => false) }));

import { resolveTrackPlaybackUrls } from '@/lib/media/audio/online/online-resolver';

const track = {
  id: 'track-1',
  source: 'wy' as const,
  name: 'Song',
  artist: 'Artist',
  duration: '03:00',
  meta: {},
};

describe('offline music URL resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCached.mockResolvedValue(null);
  });

  it('does not invoke any network resolver when cache misses', async () => {
    const result = await resolveTrackPlaybackUrls(track);

    expect(result.urls).toEqual([]);
    expect(mocks.userApiMusicUrl).not.toHaveBeenCalled();
    expect(mocks.builtinUrl).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('still reads cached audio when force-refresh was requested', async () => {
    mocks.getCached.mockResolvedValue({
      bytes: new ArrayBuffer(16),
      mime: 'audio/mpeg',
      sourceUrl: 'https://cached.invalid/song.mp3',
    });

    const result = await resolveTrackPlaybackUrls(track, { skipCache: true });

    expect(result.urls).toEqual(['blob:cached-track']);
    expect(mocks.getCached).toHaveBeenCalledWith('track-1');
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

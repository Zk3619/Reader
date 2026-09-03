import { describe, expect, it } from 'vitest';
import { resolveMusicHubGlobalPlayerSync } from '@/lib/media/audio/music-hub-global-player';
import hubPlayerSrc from '@/components/media/viewer/audio/music/hub/useMusicHubPlayer.ts?raw';
import audioStoreSrc from '@/stores/viewer/media/audio.ts?raw';

describe('resolveMusicHubGlobalPlayerSync', () => {
  it('does not occupy the global bar without a playing track', () => {
    expect(
      resolveMusicHubGlobalPlayerSync({
        enabled: true,
        hasTrack: false,
        playing: false,
        loading: false,
      }),
    ).toBe('clear');
    expect(
      resolveMusicHubGlobalPlayerSync({
        enabled: true,
        hasTrack: true,
        playing: false,
        loading: false,
      }),
    ).toBe('clear');
  });

  it('occupies the bar only while actually playing', () => {
    expect(
      resolveMusicHubGlobalPlayerSync({
        enabled: true,
        hasTrack: true,
        playing: true,
        loading: false,
      }),
    ).toBe('activate');
  });

  it('keeps an existing bar across track-load gaps instead of flashing it off', () => {
    expect(
      resolveMusicHubGlobalPlayerSync({
        enabled: true,
        hasTrack: true,
        playing: false,
        loading: true,
      }),
    ).toBe('keep');
  });

  it('clears when the setting is off even if a track is playing', () => {
    expect(
      resolveMusicHubGlobalPlayerSync({
        enabled: false,
        hasTrack: true,
        playing: true,
        loading: false,
      }),
    ).toBe('clear');
  });
});

describe('music hub global player wiring', () => {
  it('hub player syncs from playing state instead of treating a restored queue as playback', () => {
    expect(hubPlayerSrc).toMatch(/resolveMusicHubGlobalPlayerSync/);
    expect(hubPlayerSrc).toMatch(/action === 'clear'/);
    expect(hubPlayerSrc).toMatch(/action === 'keep'/);
  });

  it('applyMusicTrack does not activate the global bar just because a URL resolved', () => {
    expect(audioStoreSrc).not.toMatch(/globalMediaPlayerStore\.activate\(/);
    expect(audioStoreSrc).toMatch(/notifyTrackOrChapterChange/);
  });
});

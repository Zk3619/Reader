import { describe, expect, it } from 'vitest';
import {
  MUSIC_DESKTOP_TRACK_GRID_CLASS,
  MUSIC_ONLINE_DESKTOP_TRACK_ROW_BUTTON_CLASS,
  musicLibraryDesktopTrackGridTemplate,
  musicOnlineDesktopTrackGridTemplate,
} from '@/lib/media/audio/music-desktop-track-cols';
import {
  musicHubPageContentInsetClass,
  musicHubSplitPaneInsetClass,
} from '@/lib/media/audio/music-hub-section-meta';

describe('music-desktop-track-cols', () => {
  it('uses rem/fr mins without percentage tracks', () => {
    const library = musicLibraryDesktopTrackGridTemplate();
    const online = musicOnlineDesktopTrackGridTemplate();
    expect(library).not.toMatch(/%/);
    expect(online).not.toMatch(/%/);
    expect(library).toContain('minmax(8rem, 1.5fr)');
    expect(library.startsWith('2rem 3rem')).toBe(true);
    expect(online.startsWith('3rem')).toBe(true);
  });

  it('drops album/duration tracks when hidden', () => {
    expect(
      musicLibraryDesktopTrackGridTemplate({ showAlbum: false, showDuration: false }),
    ).toBe('2rem 3rem minmax(8rem, 1.5fr) minmax(5.5rem, 0.9fr)');
    expect(musicOnlineDesktopTrackGridTemplate({ showAlbum: false })).toBe(
      '3rem minmax(8rem, 1.5fr) minmax(5.5rem, 0.9fr) 4.5rem',
    );
  });

  it('keeps online row button free of component Button gap defaults', () => {
    expect(MUSIC_ONLINE_DESKTOP_TRACK_ROW_BUTTON_CLASS).toContain('gap-0');
    expect(MUSIC_ONLINE_DESKTOP_TRACK_ROW_BUTTON_CLASS).toContain('text-left');
    expect(MUSIC_DESKTOP_TRACK_GRID_CLASS).toContain('px-2');
  });
});

describe('musicHubSplitPaneInsetClass', () => {
  it('only pads the start so list both-edges is not stacked with page pr', () => {
    expect(musicHubSplitPaneInsetClass).toBe('pl-4');
    expect(musicHubSplitPaneInsetClass).not.toMatch(/\bpr-/);
    expect(musicHubSplitPaneInsetClass).not.toMatch(/\bpx-/);
    expect(musicHubPageContentInsetClass).toBe('px-4');
  });
});

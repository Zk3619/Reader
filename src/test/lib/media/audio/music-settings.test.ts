import { beforeEach, describe, expect, it } from 'vitest';
import {
  MUSIC_SETTINGS_SCHEMA_VERSION,
  getMusicListScrollPosition,
  getMusicSettings,
  importMusicSettings,
  normalizeMusicSettings,
  setMusicListScrollPosition,
  setMusicSettings,
} from '@/lib/media/audio/music-settings';
import { migratePlayDetailLyricFontSizeToRem } from '@/lib/media/audio/play-detail-lyric-font';
import {
  DEFAULT_MUSIC_HOTKEYS,
  normalizeMusicHotkeys,
} from '@/lib/media/audio/platform/music-hotkeys';
import { isValidDislikePattern } from '@/lib/media/audio/library/dislike-filter';
import { formatDownloadFileName } from '@/lib/media/audio/audio-download';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
});

describe('music settings schema migration', () => {
  it('forces urlSourceMode to userApi even when legacy auto/builtin stored', () => {
    expect(
      normalizeMusicSettings({ schemaVersion: 19, urlSourceMode: 'auto' }).urlSourceMode,
    ).toBe('userApi');
    expect(
      normalizeMusicSettings({ schemaVersion: 19, urlSourceMode: 'builtin' }).urlSourceMode,
    ).toBe('userApi');
    expect(normalizeMusicSettings({}).urlSourceMode).toBe('userApi');
  });

  it('migrates an unversioned reader_music_settings value in place', () => {
    localStorage.setItem(
      'reader_music_settings',
      JSON.stringify({ playSpeed: 1.25, listSaveScrollPosition: false }),
    );

    const settings = getMusicSettings();

    expect(settings.schemaVersion).toBe(MUSIC_SETTINGS_SCHEMA_VERSION);
    expect(settings.playSpeed).toBe(1.25);
    expect(settings.listSaveScrollPosition).toBe(false);
    expect(settings.urlSourceMode).toBe('userApi');
    expect(JSON.parse(localStorage.getItem('reader_music_settings') ?? '{}')).toMatchObject({
      schemaVersion: MUSIC_SETTINGS_SCHEMA_VERSION,
      playSpeed: 1.25,
    });
  });

  it('maps LX dotted keys and lets native keys take precedence', () => {
    const settings = normalizeMusicSettings({
      'player.volume': 1.5,
      'player.isMute': true,
      'player.isPlayLxlrc': false,
      'player.preservesPitch': false,
      'player.playQuality': 'flac',
      'player.startupAutoPlay': true,
      'player.powerSaveBlocker': false,
      'player.isShowTaskProgess': false,
      'player.isMaxOutputChannelCount': true,
      'player.isSwapLyricTranslationAndRoma': true,
      'player.isS2t': true,
      'desktopLyric.style.opacity': 75,
      'list.isSaveScrollLocation': false,
      lyricTrack: 'lxlyric',
      musicVolume: 0.4,
    });

    expect(settings.musicVolume).toBe(0.4);
    expect(settings.musicMuted).toBe(true);
    expect(settings.listSaveScrollPosition).toBe(false);
    expect(settings.lyricUseLxLyric).toBe(false);
    expect(settings.preservesPitch).toBe(false);
    expect(settings.playQualityPreference).toBe('flac');
    expect(settings.startupAutoPlay).toBe(true);
    expect(settings.preventSleepWhilePlaying).toBe(false);
    expect(settings.showTaskbarProgress).toBe(false);
    expect(settings.audioUseMaxChannels).toBe(true);
    expect(settings.lyricSecondaryOrder).toBe('translation-first');
    expect(settings.lyricChineseConversion).toBe(2);
    expect(settings.desktopLyricOpacity).toBe(0.75);
    expect(settings.lyricTrack).toBe('lyric');
  });

  it('normalizes malformed and out-of-range imported values', () => {
    importMusicSettings(
      JSON.stringify({
        playSpeed: Number.NaN,
        openApiPort: 99_999,
        musicVolume: -2,
        lyricTrack: 'unknown',
      }),
    );

    expect(getMusicSettings()).toMatchObject({
      playSpeed: 1,
      openApiPort: 65_535,
      musicVolume: 0,
      lyricTrack: 'lyric',
    });
  });

  it('persists volume and respects the list scroll setting', () => {
    setMusicSettings({ musicVolume: 0.35, musicMuted: true });
    expect(getMusicSettings()).toMatchObject({ musicVolume: 0.35, musicMuted: true });

    setMusicListScrollPosition('local', 120);
    expect(getMusicListScrollPosition('local')).toBe(120);
    setMusicSettings({ listSaveScrollPosition: false });
    setMusicListScrollPosition('local', 240);
    expect(getMusicListScrollPosition('local')).toBe(120);
  });

  it('normalizes custom EQ and new capability preferences', () => {
    const settings = normalizeMusicSettings({
      eqCustomGains: [-99, -6, 0, 1, 2, 3, 4, 5, 6, 99],
      audioMaxChannels: 99,
      playDetailLyricScrollDelayMs: 99_000,
      desktopLyricLineHeight: 9,
      downloadSourceStrategy: 'invalid',
    });

    expect(settings.eqCustomGains).toEqual([-12, -6, 0, 1, 2, 3, 4, 5, 6, 12]);
    expect(settings.audioMaxChannels).toBe(32);
    expect(settings.playDetailLyricScrollDelayMs).toBe(5000);
    expect(settings.desktopLyricLineHeight).toBe(3);
    expect(settings.downloadSourceStrategy).toBe('fallback');
  });

  it('uses LX playback defaults for a new settings store', () => {
    expect(getMusicSettings()).toMatchObject({
      startupAutoPlay: false,
      preventSleepWhilePlaying: true,
      rememberProgress: false,
      autoCleanPlayedList: false,
      showLyricTranslation: false,
      showLyricRoma: false,
      desktopLyricShowTranslation: false,
      desktopLyricShowRoma: false,
      desktopLyricSecondaryPlacement: 'both-below',
      desktopLyricSecondaryOrder: 'roma-first',
      playDetailSecondaryPlacement: 'both-below',
      playDetailSecondaryOrder: 'roma-first',
      playDetailBoldFont: true,
      playDetailLyricScrollPosition: 'center',
      showTaskbarProgress: true,
      audioUseMaxChannels: false,
      audioPauseOnDeviceRemoved: false,
      playDetailLyricFontSize: 0.875,
      playDetailLyricFontSizeUnit: 'rem',
      playDetailLyricScrollDelayMs: 600,
    });
  });

  it('migrates desktop lyric translation/roma from player globals (schema < 28)', () => {
    const migrated = normalizeMusicSettings({
      schemaVersion: 27,
      showLyricTranslation: true,
      showLyricRoma: true,
      lyricSecondaryOrder: 'translation-first',
    });
    expect(migrated.desktopLyricShowTranslation).toBe(true);
    expect(migrated.desktopLyricShowRoma).toBe(true);
    expect(migrated.desktopLyricSecondaryOrder).toBe('translation-first');
    expect(migrated.desktopLyricSecondaryPlacement).toBe('both-below');
  });

  it('migrates legacy playDetailLyricFontSize from px to rem', () => {
    expect(migratePlayDetailLyricFontSizeToRem(14)).toBe(0.875);
    const migrated = normalizeMusicSettings({
      schemaVersion: 8,
      playDetailLyricFontSize: 16,
    });
    expect(migrated.playDetailLyricFontSize).toBe(1);
    const alreadyRem = normalizeMusicSettings({
      schemaVersion: 9,
      playDetailLyricFontSize: 0.875,
    });
    expect(alreadyRem.playDetailLyricFontSize).toBe(0.875);
  });
});

describe('music defect regressions', () => {
  it('applies the real download naming template', () => {
    setMusicSettings({ downloadFileNameTemplate: '{artist}/{album}-{name}-{quality}' });
    expect(
      formatDownloadFileName(
        {
          id: '1',
          source: 'wy',
          name: 'Song?',
          artist: 'Artist',
          duration: '03:00',
          meta: { album: 'Album' },
        },
        'flac',
      ),
    ).toBe('Artist_Album-Song_-flac');
  });

  it('fills missing hotkey fields from defaults without overwriting saved fields', () => {
    const hotkeys = normalizeMusicHotkeys({ play: 'Alt+P' });
    expect(hotkeys.play).toBe('Alt+P');
    expect(hotkeys.seek_forward).toBe(DEFAULT_MUSIC_HOTKEYS.seek_forward);
    expect(hotkeys.collect).toBe('');
    expect(hotkeys.lyric_toggle).toBe('');
  });

  it('rejects invalid dislike regular expressions', () => {
    expect(isValidDislikePattern('foo.*bar')).toBe(true);
    expect(isValidDislikePattern('[')).toBe(false);
  });
});

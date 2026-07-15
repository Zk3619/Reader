import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportMusicSidecarStorage,
  isMusicSidecarStorageKey,
  parseMusicBackup,
} from '@/lib/media/audio/music-backup';
import { MUSIC_SETTINGS_SCHEMA_VERSION, getMusicSettings } from '@/lib/media/audio/music-settings';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('music backup validation', () => {
  it('exports music sidecar keys without unrelated settings', () => {
    localStorage.setItem('reader_music_track_progress', '{}');
    localStorage.setItem('reader_audio_github_snapshot_url', 'url');
    localStorage.setItem('reader.music.hotkeys', '{"play":"Alt+P"}');
    localStorage.setItem('reader.lx.sync.authKeys', '{"device":"key"}');
    localStorage.setItem('unrelated', 'secret');

    expect(exportMusicSidecarStorage()).toEqual({
      reader_music_track_progress: '{}',
      reader_audio_github_snapshot_url: 'url',
      'reader.music.hotkeys': '{"play":"Alt+P"}',
      'reader.lx.sync.authKeys': '{"device":"key"}',
    });
    expect(isMusicSidecarStorageKey('unrelated')).toBe(false);
  });

  it('rejects future backup and settings versions', () => {
    const base = {
      kind: 'reader-music-backup',
      version: 1,
      settingsSchemaVersion: MUSIC_SETTINGS_SCHEMA_VERSION,
      exportedAt: 1,
      settings: getMusicSettings(),
      sidecarStorage: {},
      snapshot: { version: 1, exportedAt: 1, playlists: [], tracks: [] },
    };
    expect(parseMusicBackup(JSON.stringify(base)).kind).toBe('reader-music-backup');
    expect(() => parseMusicBackup(JSON.stringify({ ...base, version: 2 }))).toThrow();
    expect(() =>
      parseMusicBackup(
        JSON.stringify({ ...base, settingsSchemaVersion: MUSIC_SETTINGS_SCHEMA_VERSION + 1 }),
      ),
    ).toThrow();
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('music background playback isolation', () => {
  it('useMusicHubPlayer binds musicPositionSec instead of chapterPos', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/viewer/audio/music/hub/useMusicHubPlayer.ts'),
      'utf8',
    );
    expect(src).toMatch(/state\(\)\.musicPositionSec/);
    expect(src).toMatch(/setMusicPositionSec/);
    expect(src).not.toMatch(/chapterPos: \(\) => state\(\)\.chapterPos/);
    expect(src).not.toMatch(/viewerStore\.setChapterPos/);
  });

  it('closeBook preserves music in one reset (no restoreMusicPlayback flicker)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/stores/viewer/media/store.ts'),
      'utf8',
    );
    expect(src).toMatch(/resetViewerStatePreservingMusic\(musicSnap\)/);
    expect(src).not.toMatch(/restoreMusicPlayback\(musicSnap\)/);
  });

  it('audioShellOpenViewer opens music hub even without play detail track', async () => {
    const openViewer = vi.fn();
    const globalOpen = vi.fn();
    const {
      registerAudioShellHandlers,
      registerGlobalAudioOpenViewer,
      audioShellOpenViewer,
    } = await import('@/lib/media/audio/audio-shell-controls');

    registerAudioShellHandlers({
      togglePlay: () => undefined,
      skipPrev: () => undefined,
      skipNext: () => undefined,
      stop: () => undefined,
      openViewer,
    });
    registerGlobalAudioOpenViewer(globalOpen);

    // 无队列曲目时不进详情，但仍应打开音乐壳
    audioShellOpenViewer();
    expect(openViewer).not.toHaveBeenCalled();
    expect(globalOpen).toHaveBeenCalledTimes(1);

    globalOpen.mockClear();
    audioShellOpenViewer({ preferHub: true });
    expect(openViewer).not.toHaveBeenCalled();
    expect(globalOpen).toHaveBeenCalledTimes(1);

    registerAudioShellHandlers(null);
    registerGlobalAudioOpenViewer(null);
  });
});

describe('music playback snapshot shape', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('snapshotMusicPlayback stores musicPositionSec and ignores chapterPos pollution', async () => {
    const { setState } = await import('@/stores/viewer/media/state');
    const {
      snapshotMusicPlayback,
      shouldPreserveMusicPlayback,
    } = await import('@/stores/viewer/media/audio');
    const { MediaKind } = await import('@/lib/book-source/book-type');

    setState({
      kind: MediaKind.text,
      book: { bookUrl: 'book://x', name: 't' } as never,
      playbackMode: 'music',
      trackQueue: [{ id: '1', name: 'song', artist: 'a', source: 'wy', duration: '03:00', meta: {} }] as never,
      trackIndex: 0,
      musicPrimaryUrl: 'https://example.com/a.mp3',
      musicMediaUrls: ['https://example.com/a.mp3'],
      musicPositionSec: 125,
      chapterPos: 0.42,
    });

    expect(shouldPreserveMusicPlayback()).toBe(true);
    const snap = snapshotMusicPlayback();
    expect(snap).not.toBeNull();
    expect(snap!.musicPositionSec).toBe(125);
    expect(snap!).not.toHaveProperty('chapterPos');
  });

  it('resetViewerStatePreservingMusic keeps urls and position atomically', async () => {
    const { setState, resetViewerStatePreservingMusic, state } = await import(
      '@/stores/viewer/media/state'
    );
    const { MediaKind } = await import('@/lib/book-source/book-type');

    setState({
      kind: MediaKind.text,
      book: { bookUrl: 'book://x', name: 't' } as never,
      chapterPos: 0.8,
      playbackMode: 'music',
      trackQueue: [{ id: '1', name: 'song', artist: 'a', source: 'wy', duration: '03:00', meta: {} }] as never,
      trackIndex: 0,
      musicPrimaryUrl: 'https://example.com/a.mp3',
      musicMediaUrls: ['https://example.com/a.mp3'],
      musicPositionSec: 188,
    });

    resetViewerStatePreservingMusic({
      playbackMode: 'music',
      contentSession: null,
      trackQueue: state.trackQueue,
      trackIndex: 0,
      musicQueueOrigin: 'list',
      playerListId: 'local',
      playerListName: '本地',
      playerListKind: 'builtin',
      activePlaylistId: 'local',
      activeMusicGroupId: null,
      activeSource: 'wy',
      musicMediaUrls: ['https://example.com/a.mp3'],
      musicPrimaryUrl: 'https://example.com/a.mp3',
      musicPositionSec: 188,
      musicLoading: false,
      musicError: null,
      playbackStatus: null,
      musicSection: 'list',
    });

    expect(state.book).toBeNull();
    expect(state.kind).toBeNull();
    expect(state.chapterPos).toBe(0);
    expect(state.musicPrimaryUrl).toBe('https://example.com/a.mp3');
    expect(state.musicMediaUrls).toEqual(['https://example.com/a.mp3']);
    expect(state.musicPositionSec).toBe(188);
    expect(state.playbackMode).toBe('music');
  });
});

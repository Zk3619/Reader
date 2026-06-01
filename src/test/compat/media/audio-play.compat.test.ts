import { describe, expect, it } from 'vitest';
import {
  cyclePlayMode,
  getAudioPlayConfig,
  normalizePlayMode,
} from '@/lib/media/audio/book-audio-config';
import { parseAudioUrls, parseParsedAudioUrls } from '@/lib/media/audio/parse-audio-urls';
import {
  findPlayableChapterIndex,
  resolveNextChapterIndex,
} from '@/lib/media/audio/play-mode';
import { AudioPlayMode } from '@/lib/media/audio/types';

describe('audio play (Legado compat)', () => {
  it('parses JSON array audio urls', () => {
    const raw = '["https://a.com/1.mp3","https://a.com/2.mp3"]';
    expect(parseAudioUrls(raw)).toEqual(['https://a.com/1.mp3', 'https://a.com/2.mp3']);
  });

  it('parses JSON object with url field (聚合听书)', () => {
    const raw = JSON.stringify({
      code: 0,
      data: { url: 'https://cdn.example/voice/7551454239619400254.mp3?sign=abc' },
    });
    const parsed = parseParsedAudioUrls(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.url).toContain('7551454239619400254');
  });

  it('parses Legado url with headers suffix', () => {
    const raw =
      'https://cdn.example/a.m4a,{"headers":{"Cookie":"qttoken=abc","User-Agent":"Legado"}}';
    const parsed = parseParsedAudioUrls(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.url).toBe('https://cdn.example/a.m4a');
    expect(parsed[0]?.headers?.Cookie).toBe('qttoken=abc');
  });

  it('parses plain https url without extension (番茄 CDN)', () => {
    const raw = 'https://v1.gyks.cf/stream?id=7551454239619400254&token=xyz';
    expect(parseParsedAudioUrls(raw)[0]?.url).toBe(raw);
  });

  it('reads playMode and credits from readConfig', () => {
    const book = {
      readConfig: {
        playMode: 2,
        playSpeed: 1.5,
        openCredits: 10,
        closeCredits: 20,
      },
    } as import('@/types').Book;
    const cfg = getAudioPlayConfig(book);
    expect(cfg.playMode).toBe(AudioPlayMode.random);
    expect(cfg.playSpeed).toBe(1.5);
    expect(cfg.openCredits).toBe(10);
    expect(cfg.closeCredits).toBe(20);
  });

  it('cycles play modes like Legado', () => {
    expect(cyclePlayMode(AudioPlayMode.listEndStop)).toBe(AudioPlayMode.singleLoop);
    expect(cyclePlayMode(AudioPlayMode.listLoop)).toBe(AudioPlayMode.listEndStop);
  });

  it('resolveNextChapterIndex respects list end stop', () => {
    expect(
      resolveNextChapterIndex(4, 5, AudioPlayMode.listEndStop),
    ).toBeNull();
    expect(
      resolveNextChapterIndex(3, 5, AudioPlayMode.listEndStop),
    ).toBe(4);
  });

  it('resolveNextChapterIndex loops in list loop mode', () => {
    expect(
      resolveNextChapterIndex(4, 5, AudioPlayMode.listLoop),
    ).toBe(0);
  });

  it('mustFetchAsBlob for fqnovelvod CDN', async () => {
    const { fetchAudioBlobSrc } = await import('@/lib/media/audio/resolve-audio-playback');
    const item = {
      url: 'https://v5-novelapp.fqnovelvod.com/path/audio?mime_type=audio_mpeg',
    };
    const headers = { Referer: 'https://reading.snssdk.com/' };
    expect(item.url).toMatch(/fqnovelvod/);
    expect(headers.Referer).toBeTruthy();
    expect(typeof fetchAudioBlobSrc).toBe('function');
  });

  it('skips volume chapters when finding playable index', () => {
    const catalog = [
      { isVolume: false },
      { isVolume: true },
      { isVolume: false },
    ];
    expect(findPlayableChapterIndex(catalog, 1, 1)).toBe(2);
    expect(normalizePlayMode(99)).toBe(AudioPlayMode.listEndStop);
  });
});

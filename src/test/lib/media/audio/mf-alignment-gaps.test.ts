import { describe, expect, it, vi } from 'vitest';
import {
  buildMfQualityOrder,
  MF_QUALITY_KEYS,
} from '@/lib/media/audio/online/mf-plugin/media-source-quality';
import {
  buildMfProxyPlayUrl,
  isMfProxyRequired,
} from '@/lib/media/audio/online/mf-plugin/request-forwarder';
import {
  MF_LOCAL_PLUGIN_ID,
  MF_LOCAL_PLUGIN_NAME,
  createLocalPluginDefine,
} from '@/lib/media/audio/online/mf-plugin/local-plugin';
import {
  MF_PLUGIN_LEGACY_STORAGE_KEY,
  readMfPluginIndexSync,
  writeMfPluginIndexSync,
  clearLegacyMfPluginsSync,
} from '@/lib/media/audio/online/mf-plugin/plugin-disk-store';

describe('mf quality fallback order', () => {
  it('expands lower-first then higher', () => {
    expect(buildMfQualityOrder('standard', MF_QUALITY_KEYS, 'lower')).toEqual([
      'standard',
      'low',
      'high',
      'super',
    ]);
  });

  it('expands higher-first then lower', () => {
    expect(buildMfQualityOrder('standard', MF_QUALITY_KEYS, 'higher')).toEqual([
      'standard',
      'high',
      'super',
      'low',
    ]);
  });

  it('intersects with qualityOrder', () => {
    expect(
      buildMfQualityOrder('high', ['low', 'standard', 'high'], 'lower'),
    ).toEqual(['high', 'standard', 'low']);
  });
});

describe('mf request forwarder helpers', () => {
  it('detects proxy-required urls', () => {
    expect(isMfProxyRequired('https://cdn.example/a.mp3')).toBe(true);
    expect(isMfProxyRequired('blob:http://localhost/x')).toBe(false);
    expect(isMfProxyRequired('file:///tmp/a.mp3')).toBe(false);
  });

  it('returns null proxy url outside Tauri', async () => {
    const url = await buildMfProxyPlayUrl('https://cdn.example/a.mp3', {
      Referer: 'https://example.com',
    });
    expect(url).toBeNull();
  });
});

describe('mf local plugin', () => {
  it('exposes local platform identity', () => {
    expect(MF_LOCAL_PLUGIN_ID).toBe('local');
    expect(MF_LOCAL_PLUGIN_NAME).toBe('本地');
    const define = createLocalPluginDefine();
    expect(define.platform).toBe('本地');
    expect(typeof define.getMediaSource).toBe('function');
    expect(typeof define.getLyric).toBe('function');
    expect(typeof define.importMusicItem).toBe('function');
    expect(typeof define.importMusicSheet).toBe('function');
  });

  it('getMediaSource returns http urls as-is', async () => {
    const define = createLocalPluginDefine();
    const result = await define.getMediaSource!(
      {
        id: '1',
        platform: '本地',
        title: 't',
        artist: 'a',
        url: 'https://example.com/a.mp3',
      },
      'standard',
    );
    expect(result?.url).toBe('https://example.com/a.mp3');
  });
});

describe('mf plugin index storage', () => {
  it('persists index without scripts', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    writeMfPluginIndexSync([
      {
        id: 'abc',
        name: 'Demo',
        hash: 'hash1',
        enabled: true,
        order: 1,
        supportedMethods: ['search'],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const list = readMfPluginIndexSync();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('abc');
    expect((list[0] as { script?: string }).script).toBeUndefined();
    clearLegacyMfPluginsSync();
    expect(store.has(MF_PLUGIN_LEGACY_STORAGE_KEY)).toBe(false);
    vi.unstubAllGlobals();
  });
});

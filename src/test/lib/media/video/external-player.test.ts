import { describe, expect, it } from 'vitest';
import {
  isRemoteOrAppSchemeUrl,
  listExternalPlayerOptions,
  resolveExternalPlayerSelection,
} from '@/lib/media/tv/play/external-player';
import {
  coerceExternalKind,
  coerceExternalPresets,
  externalCustomKind,
  type VideoPlaybackPrefs,
} from '@/lib/media/video/playback/prefs';

describe('isRemoteOrAppSchemeUrl', () => {
  it('does not treat Windows drive paths as URLs', () => {
    expect(isRemoteOrAppSchemeUrl('J:\\迅雷下载\\鬼.父')).toBe(false);
    expect(isRemoteOrAppSchemeUrl('C:/Videos/a.mp4')).toBe(false);
    expect(isRemoteOrAppSchemeUrl('\\\\server\\share\\a.mkv')).toBe(false);
  });

  it('accepts http(s) and other app schemes', () => {
    expect(isRemoteOrAppSchemeUrl('https://example.com/a.mp4')).toBe(true);
    expect(isRemoteOrAppSchemeUrl('http://127.0.0.1/x')).toBe(true);
    expect(isRemoteOrAppSchemeUrl('mailto:a@b.com')).toBe(true);
  });

  it('rejects file: (local path path should use openPath)', () => {
    expect(isRemoteOrAppSchemeUrl('file:///C:/a.mp4')).toBe(false);
  });
});

describe('external player presets coerce', () => {
  it('keeps custom kind only when preset exists', () => {
    const presets = coerceExternalPresets([
      { id: 'p1', name: 'Pot', exePath: 'D:\\PotPlayer\\PotPlayerMini64.exe' },
    ]);
    expect(coerceExternalKind(externalCustomKind('p1'), presets)).toBe(
      'custom:p1',
    );
    expect(coerceExternalKind(externalCustomKind('missing'), presets)).toBe(
      'system',
    );
  });

  it('lists preset by name and drops missing selection', () => {
    const prefs = {
      externalPresets: [
        {
          id: 'p1',
          name: 'PotPlayer',
          exePath: 'D:\\Pot\\Pot.exe',
          extraArgs: [],
        },
      ],
      externalKind: 'custom:p1',
    } as unknown as VideoPlaybackPrefs;
    const opts = listExternalPlayerOptions(prefs);
    expect(
      opts.some((o) => o.value === 'custom:p1' && o.label === 'PotPlayer'),
    ).toBe(true);
    expect(resolveExternalPlayerSelection('custom:gone', prefs)).toBe('system');
  });
});

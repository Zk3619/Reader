import { describe, expect, it, beforeEach } from 'vitest';
import mfCookies, {
  resetMfCookieJarForTests,
} from '@/lib/media/audio/online/mf-plugin/polyfill/cookies';
import mfPluginStorage, {
  MF_PLUGIN_STORAGE_MAX_BYTES,
  resetMfPluginStorageForTests,
} from '@/lib/media/audio/online/mf-plugin/polyfill/storage';
import { loadMfPluginCode } from '@/lib/media/audio/online/mf-plugin/runtime';

describe('mf cookie polyfill', () => {
  beforeEach(() => {
    resetMfCookieJarForTests();
  });

  it('sets and gets cookies by url domain', async () => {
    await mfCookies.set('https://music.example.com/api', {
      name: 'token',
      value: 'abc',
      path: '/',
    });
    const map = await mfCookies.get('https://music.example.com/path');
    expect(map.token?.value).toBe('abc');
    expect(await mfCookies.get('https://other.example.com/')).toEqual({});
  });
});

describe('mf plugin storage', () => {
  beforeEach(() => {
    resetMfPluginStorageForTests();
  });

  it('persists items and enforces size limit', async () => {
    await mfPluginStorage.setItem('k', 'v');
    expect(await mfPluginStorage.getItem('k')).toBe('v');
    await mfPluginStorage.removeItem('k');
    expect(await mfPluginStorage.getItem('k')).toBeNull();

    const huge = 'x'.repeat(MF_PLUGIN_STORAGE_MAX_BYTES);
    await expect(mfPluginStorage.setItem('big', huge)).rejects.toThrow(
      /exceeds limit|persist failed/i,
    );
  });
});

describe('mf-plugin runtime sandbox', () => {
  it('exposes __musicfree_require and ensurePluginInitialized', async () => {
    const loaded = loadMfPluginCode({
      code: [
        "const ax = __musicfree_require('axios');",
        "if (typeof ax !== 'function' && typeof ax.default !== 'function') {",
        "  throw new Error('__musicfree_require axios missing');",
        '}',
        'if (!process.ensurePluginInitialized || typeof process.ensurePluginInitialized.then !== \'function\') {',
        "  throw new Error('ensurePluginInitialized missing');",
        '}',
        'module.exports = {',
        "  platform: 'SandboxProbe',",
        "  version: '1.0.0',",
        '  async search() { return { isEnd: true, data: [] }; },',
        '  async getMediaSource() { return null; },',
        '};',
      ].join('\n'),
      pluginId: 'sandbox-probe',
    });
    expect(loaded.name).toBe('SandboxProbe');
    await expect(loaded.instance.search!('q', 1, 'music')).resolves.toEqual({
      isEnd: true,
      data: [],
    });
  });

  it('aliases @musicfree/storage to musicfree/storage', () => {
    const loaded = loadMfPluginCode({
      code: [
        "const s1 = require('musicfree/storage');",
        "const s2 = require('@musicfree/storage');",
        "if (s1 !== s2) throw new Error('storage alias mismatch');",
        'module.exports = {',
        "  platform: 'StorageAlias',",
        "  async getMediaSource() { return { url: 'https://x/a.mp3' }; },",
        '};',
      ].join('\n'),
      pluginId: 'storage-alias',
    });
    expect(loaded.name).toBe('StorageAlias');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractMfPluginUrlsFromManifest,
  isMfPluginsJsonManifest,
  looksLikeMfPluginsJsonText,
  urlLooksLikeMfPluginsJson,
} from '@/lib/media/audio/online/mf-plugin/plugins-json';

const EXAMPLE_JSON = readFileSync(
  resolve(__dirname, '../../../../../examples/mf/Thomas喲/plugins.json'),
  'utf8',
);

describe('mf plugins.json', () => {
  it('detects MusicFree subscription manifest', () => {
    expect(looksLikeMfPluginsJsonText(EXAMPLE_JSON)).toBe(true);
    expect(isMfPluginsJsonManifest(JSON.parse(EXAMPLE_JSON))).toBe(true);
    const urls = extractMfPluginUrlsFromManifest(JSON.parse(EXAMPLE_JSON));
    expect(urls.length).toBeGreaterThanOrEqual(5);
    expect(urls.every((u) => /^https?:\/\//i.test(u))).toBe(true);
  });

  it('accepts array-only and srcUrl aliases', () => {
    expect(
      extractMfPluginUrlsFromManifest([
        'https://a.test/p.js',
        { srcUrl: 'https://b.test/q.js', name: 'Q' },
      ]),
    ).toEqual(['https://a.test/p.js', 'https://b.test/q.js']);
  });

  it('rejects playlist-like json', () => {
    expect(
      looksLikeMfPluginsJsonText(
        JSON.stringify({ name: '歌单', songs: [{ id: '1', name: 'a' }] }),
      ),
    ).toBe(false);
  });

  it('matches Desktop .json url rules', () => {
    expect(urlLooksLikeMfPluginsJson('https://x/plugins.json')).toBe(true);
    expect(urlLooksLikeMfPluginsJson('https://x/list.json?v=1')).toBe(true);
    expect(urlLooksLikeMfPluginsJson('https://x/plugin.js')).toBe(false);
  });
});

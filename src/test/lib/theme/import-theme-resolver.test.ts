import { describe, expect, it } from 'vitest';
import { createDefaultThemePack } from '@/lib/theme/schema/theme-pack-v1';
import {
  flattenResolvedThemes,
  resolveThemesFromText,
} from '@/lib/theme/import/import-theme-resolver';

describe('import-theme-resolver', () => {
  it('parses single theme pack JSON', async () => {
    const pack = createDefaultThemePack({ name: '导入测试' });
    const result = await resolveThemesFromText(JSON.stringify(pack));
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.pack.name).toBe('导入测试');
    expect(result.entries[0]?.source).toBe('reader-pack');
  });

  it('parses array of theme packs', async () => {
    const packs = [createDefaultThemePack({ name: 'A' }), createDefaultThemePack({ name: 'B' })];
    const result = await resolveThemesFromText(JSON.stringify(packs));
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((e) => e.pack.name)).toEqual(['A', 'B']);
  });

  it('returns empty entries for invalid JSON text', async () => {
    const result = await resolveThemesFromText('not valid json {{{');
    expect(result.entries).toHaveLength(0);
  });

  it('returns empty entries for empty text', async () => {
    const result = await resolveThemesFromText('   ');
    expect(result.entries).toHaveLength(0);
  });

  it('flattenResolvedThemes extracts pack manifests', async () => {
    const pack = createDefaultThemePack({ name: 'Flat' });
    const resolved = await resolveThemesFromText(JSON.stringify(pack));
    const flat = flattenResolvedThemes(resolved);
    expect(flat).toHaveLength(1);
    expect(flat[0]?.name).toBe('Flat');
  });
});

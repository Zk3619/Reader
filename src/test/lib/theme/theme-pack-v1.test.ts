import { describe, expect, it } from 'vitest';
import { createDefaultThemePack } from '@/lib/theme/schema/theme-pack-v1';
import { parseThemePackJson, parseThemePackJsonString } from '@/lib/theme/schema/validate-theme-pack';
import { legadoThemeEntryToPack } from '@/lib/theme/adapters/legado-theme-adapter';
import { exportThemePackJson, importThemePackJson } from '@/lib/theme/theme-pack-io';

describe('theme-pack-v1', () => {
  it('creates a default pack with the latest schema version', () => {
    const pack = createDefaultThemePack({ name: '测试' });
    expect(pack.schemaVersion).toBe(3);
    expect(pack.name).toBe('测试');
    expect(pack.scopes.app).toBe(true);
    expect(pack.app?.tokens.light.background).toBeTruthy();
  });

  it('round-trips JSON export/import', () => {
    const pack = createDefaultThemePack();
    const json = exportThemePackJson(pack);
    const result = importThemePackJson(json);
    expect(result.ok).toBe(true);
    expect(result.pack?.id).toBe(pack.id);
  });

  it('rejects invalid schema version', () => {
    const result = parseThemePackJson({ schemaVersion: 99, name: 'x' });
    expect(result.ok).toBe(false);
  });

  it('parses valid pack', () => {
    const pack = createDefaultThemePack();
    const result = parseThemePackJsonString(JSON.stringify(pack));
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('keeps valid v3 targets and drops unknown targets', () => {
    const pack = createDefaultThemePack();
    const result = parseThemePackJson({
      ...pack,
      targets: {
        'module.music': { background: { type: 'solid', color: '#101010' } },
        unknown: { background: { type: 'solid', color: '#ffffff' } },
      },
    });
    expect(result.ok).toBe(true);
    expect(result.pack?.targets?.['module.music']?.background).toEqual({
      type: 'solid',
      color: '#101010',
    });
    expect(Object.keys(result.pack?.targets ?? {})).not.toContain('unknown');
  });

  it('converts legado theme entry', () => {
    const pack = legadoThemeEntryToPack({
      themeName: '经典白',
      isNightTheme: false,
      primaryColor: '#fffbf9fd',
      accentColor: '#ffd4d0da',
      backgroundColor: '#fff5f5f5',
      bottomBackground: '#fffbf9fd',
    });
    expect(pack.name).toBe('经典白');
    expect(pack.scopes.app).toBe(true);
    expect(pack.app?.tokens.light).toBeTruthy();
  });
});
